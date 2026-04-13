import cron from 'node-cron';
import { initDB, createLog, updateLog, cleanOldBids } from './db';
import { collectBids } from './collector';
import { analyzeBids } from './analyzer';
import { notifyNewBids } from './notifier';

async function runPipeline() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`[${new Date().toLocaleString('ko-KR')}] 🔄 크롤러 시작`);
  const logId = createLog();

  try {
    // Step 1: 수집
    const collectResult = await collectBids();
    console.log(`📥 수집: 신규 ${collectResult.newBids}건 (전체 ${collectResult.uniqueCount}건)`);

    // Step 2: AI 분석 (지원 가능 여부 판단)
    const analyzeResult = await analyzeBids(15);
    console.log(`🤖 분석: ${analyzeResult.analyzed}건 (STRONG ${analyzeResult.strongFit}, GOOD ${analyzeResult.goodFit})`);

    // Step 3: 지원 가능 공고 Slack 알림
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
    console.log('✅ 크롤러 완료');
  } catch (error: any) {
    console.error('❌ 크롤러 실패:', error.message);
    updateLog(logId, {
      finished_at: new Date().toISOString(),
      status: 'FAILED',
      error_message: error.message,
    });
  }
}

// 초기화
initDB();
console.log('🚀 바틀 입찰 모니터 스케줄러 시작 (매일 09:00 / 16:00)');

// 시작 시 1회 실행
runPipeline();

// 매일 오전 9시, 오후 4시 크롤링 + 알림
cron.schedule('0 9,16 * * *', () => runPipeline());

// 매일 자정 30일 지난 데이터 정리
cron.schedule('0 0 * * *', () => {
  const deleted = cleanOldBids(30);
  console.log(`🗑️ ${deleted}건 이전 데이터 정리`);
});
