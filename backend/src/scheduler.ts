import cron from 'node-cron';
import { initDB, createLog, updateLog, cleanOldBids, savePipelineResult, getBidsForPipeline } from './db';
import { collectBids } from './collector';
import { analyzeBids } from './analyzer';
import { notifyNewBids, sendDailySummary, sendDeadlineReminder, notifyPipelineResult } from './notifier';
import { runBidPipeline } from './pipeline';
import { SCORE_THRESHOLD } from './config';

async function runPipeline() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[${new Date().toLocaleString('ko-KR')}] 🔄 파이프라인 시작`);
  const logId = createLog();

  try {
    // Step 1: 수집
    const collectResult = await collectBids();
    console.log(`📥 수집: 신규 ${collectResult.newBids}건 (전체 ${collectResult.uniqueCount}건)`);

    // Step 2: AI 분석
    const analyzeResult = await analyzeBids(15);
    console.log(`🤖 분석: ${analyzeResult.analyzed}건 (STRONG ${analyzeResult.strongFit}, GOOD ${analyzeResult.goodFit})`);

    // Step 3: Slack 알림
    const notifiedCount = await notifyNewBids();
    console.log(`📢 알림: ${notifiedCount}건 발송`);

    // Step 4: GOOD_FIT 이상 자동 입찰 준비
    const pipelineBids = getBidsForPipeline(SCORE_THRESHOLD.GOOD_FIT);
    if (pipelineBids.length > 0) {
      console.log(`\n🚀 입찰 준비 파이프라인: ${pipelineBids.length}건 대상`);
      for (const bid of pipelineBids) {
        if (!bid.id) continue;
        try {
          const result = await runBidPipeline(bid.id);

          // DB에 저장
          savePipelineResult(bid.bid_ntce_no, {
            bid_id: bid.id,
            checklist_json: result.checklist ? JSON.stringify(result.checklist) : undefined,
            price_advice_json: result.priceAdvice ? JSON.stringify(result.priceAdvice) : undefined,
            proposal_status_json: JSON.stringify(result.proposals),
            errors_json: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined,
            status: result.errors.length === 0 ? 'COMPLETE' : 'PARTIAL',
          });

          // Slack 알림
          await notifyPipelineResult(result);
        } catch (error: any) {
          console.error(`  ❌ 파이프라인 에러: ${bid.bid_ntce_nm}: ${error.message}`);
        }
      }
    }

    updateLog(logId, {
      finished_at: new Date().toISOString(),
      total_keywords: collectResult.totalKeywords,
      total_collected: collectResult.uniqueCount,
      new_bids: collectResult.newBids,
      analyzed: analyzeResult.analyzed,
      notified: notifiedCount,
      status: 'SUCCESS',
    });
    console.log('✅ 파이프라인 완료');
  } catch (error: any) {
    console.error('❌ 파이프라인 실패:', error.message);
    updateLog(logId, {
      finished_at: new Date().toISOString(),
      status: 'FAILED',
      error_message: error.message,
    });
  }
}

// 초기화
initDB();
console.log('🚀 바틀 입찰 모니터 스케줄러 시작');

// 시작 시 1회 실행
runPipeline();

// 매 3시간 (06, 09, 12, 15, 18, 21시)
cron.schedule('0 6,9,12,15,18,21 * * *', () => runPipeline());

// 매일 오전 9시 일일 요약
cron.schedule('5 9 * * *', () => sendDailySummary());

// 매일 오전 8시, 오후 5시 마감 임박 리마인더
cron.schedule('0 8,17 * * *', async () => {
  const count = await sendDeadlineReminder();
  if (count > 0) console.log(`⏰ 마감 임박 리마인더: ${count}건 발송`);
});

// 매일 자정 30일 지난 데이터 정리
cron.schedule('0 0 * * *', () => {
  const deleted = cleanOldBids(30);
  console.log(`🗑️ ${deleted}건 이전 데이터 정리`);
});
