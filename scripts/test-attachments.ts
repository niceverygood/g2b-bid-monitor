/**
 * 첨부파일 다운로드 + 파싱 파이프라인 1건 테스트
 *
 * 사용법:
 *   # (a) 자동 — score>=70 공고 중 PENDING 1건 선택
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx tsx scripts/test-attachments.ts
 *
 *   # (b) 수동 — 특정 bid_ntce_no 지정
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/test-attachments.ts R268K01458754
 *
 * 출력:
 *   - 선택된 공고 정보
 *   - 첨부 엔트리 개수
 *   - 다운로드/파싱 결과 (파일별 파서/글자수/warnings)
 *   - 실패 시 에러 요약
 */

import { resolveBid, getBidsForAttachmentFetch } from '../lib/db';
import { fetchAndParseAttachments } from '../lib/attachments/fetcher';
import { SCORE_THRESHOLD } from '../lib/config';

async function main() {
  const arg = process.argv[2];

  let bid;
  if (arg) {
    bid = await resolveBid(arg);
    if (!bid) {
      console.error(`❌ 공고를 찾을 수 없음: ${arg}`);
      process.exit(1);
    }
  } else {
    const candidates = await getBidsForAttachmentFetch(
      SCORE_THRESHOLD.ATTACHMENT_FETCH,
      1
    );
    if (candidates.length === 0) {
      console.log(
        `ℹ️  테스트 대상 없음: score >= ${SCORE_THRESHOLD.ATTACHMENT_FETCH} 이면서 PENDING 이고 첨부가 있는 공고가 없습니다.`
      );
      console.log('   bid_ntce_no 를 직접 넘겨서 테스트하세요:');
      console.log('   npx tsx scripts/test-attachments.ts R268K01458754');
      process.exit(0);
    }
    bid = candidates[0];
  }

  console.log('─'.repeat(70));
  console.log(`📋 공고: ${bid.bid_ntce_nm}`);
  console.log(`   번호: ${bid.bid_ntce_no}`);
  console.log(`   점수: ${bid.total_score} (${bid.recommendation})`);
  console.log(`   기관: ${bid.ntce_instt_nm ?? '-'}`);
  const attEntries = Array.isArray(bid.attachments) ? bid.attachments : [];
  console.log(`   첨부: ${attEntries.length}건`);
  attEntries.forEach((a: any, i: number) => {
    console.log(`     ${i + 1}. ${a.fileName}`);
  });
  console.log('─'.repeat(70));

  if (attEntries.length === 0) {
    console.log(
      '⚠️  첨부 엔트리가 없음. collector 재실행이 필요할 수 있습니다.'
    );
    process.exit(0);
  }

  console.log('🚀 다운로드 + 파싱 시작...\n');
  const t0 = Date.now();
  const result = await fetchAndParseAttachments(bid);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n─ 결과 ' + '─'.repeat(62));
  console.log(`⏱️  소요: ${secs}s`);
  console.log(`✅ 다운로드: ${result.downloaded}건`);
  console.log(`📄 파싱 성공: ${result.parsed}건`);
  console.log(`❌ 실패: ${result.failed}건`);
  if (result.errors.length > 0) {
    console.log('\n에러 목록:');
    result.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log('─'.repeat(70));
}

main().catch((err) => {
  console.error('❌ 테스트 실패:', err);
  process.exit(1);
});
