import cron from 'node-cron';
import { initDB, createLog, updateLog, cleanOldBids } from './db';
import { collectBids } from './collector';
import { analyzeBids } from './analyzer';
import { notifyNewBids, sendDailySummary } from './notifier';

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

// 매일 자정 30일 지난 데이터 정리
cron.schedule('0 0 * * *', () => {
  const deleted = cleanOldBids(30);
  console.log(`🗑️ ${deleted}건 이전 데이터 정리`);
});
