// Slack 파이프라인 알림 payload가 제안서 링크를 포함하는지 검증
// 로컬 mock HTTP 서버로 webhook을 가로채서 페이로드를 캡처함
import http from 'http';

const PORT = 4567;
process.env.SLACK_WEBHOOK_URL = `http://localhost:${PORT}/webhook`;
process.env.PUBLIC_BASE_URL = 'http://localhost:3001';

// mock 서버 기동
const received: any[] = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    try { received.push(JSON.parse(body)); } catch { received.push(body); }
    res.writeHead(200); res.end('ok');
  });
});

async function main() {
  await new Promise<void>(r => mock.listen(PORT, () => r()));

  // 모듈은 env 세팅 후에 로드해야 함
  const { getBidById } = await import('../src/db');
  const { notifyPipelineResult } = await import('../src/notifier');

  const bid = getBidById(1);
  if (!bid) throw new Error('테스트 bid 없음. seed-test.ts를 먼저 실행하세요.');

  const fakeResult = {
    bid,
    checklist: {
      items: new Array(14).fill({ name: 'item', required: true }),
      estimated_prep_days: 21,
      total_items: 14,
    } as any,
    priceAdvice: {
      recommended_bid_price: 320000000,
      bid_rate: 87.7,
      strategy: '제한경쟁 적격심사로 추정',
    } as any,
    proposals: [
      { docType: 'technical', label: '기술제안서', success: true },
      { docType: 'execution', label: '사업수행계획서', success: true },
      { docType: 'personnel', label: '투입인력 현황표', success: true },
      { docType: 'company', label: '회사소개서', success: true },
      { docType: 'track_record', label: '수행실적표', success: true },
      { docType: 'pricing', label: '가격제안서', success: true },
    ],
    errors: [],
  };

  const ok = await notifyPipelineResult(fakeResult as any);
  console.log(`\n=== sendSlack 결과: ${ok} ===`);
  console.log(`=== 캡처된 webhook 요청: ${received.length}건 ===\n`);

  if (received.length === 0) {
    console.error('❌ webhook이 전혀 호출되지 않았습니다.');
    process.exit(1);
  }

  const payload = received[0];
  console.log('--- Slack 페이로드 블록 요약 ---');
  for (const b of payload.blocks) {
    if (b.type === 'header') console.log(`[header] ${b.text.text}`);
    else if (b.type === 'section') console.log(`[section]\n${b.text.text}\n`);
    else if (b.type === 'actions') {
      const buttons = b.elements.map((e: any) => `${e.text.text} → ${e.url}`).join(' | ');
      console.log(`[actions] ${buttons}`);
    } else if (b.type === 'divider') console.log(`[divider]`);
  }

  // 검증
  const allText = JSON.stringify(payload);
  const checks = [
    ['제안서 6종 보기 버튼', allText.includes('제안서 6종 보기')],
    ['인덱스 링크 포함', allText.includes('/proposals/TEST-20260414-001')],
    ['technical 링크', allText.includes('/proposals/TEST-20260414-001/technical')],
    ['pricing 링크', allText.includes('/proposals/TEST-20260414-001/pricing')],
    ['track_record 링크', allText.includes('/proposals/TEST-20260414-001/track_record')],
    ['나라장터 버튼', allText.includes('나라장터')],
    ['85점 표시', allText.includes('85점')],
    ['6/6건', allText.includes('6/6건')],
  ];
  console.log('\n--- 검증 결과 ---');
  let pass = 0, fail = 0;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`);
    if (ok) pass++; else fail++;
  }
  console.log(`\n${pass}/${checks.length} 통과`);

  mock.close();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); mock.close(); process.exit(1); });
