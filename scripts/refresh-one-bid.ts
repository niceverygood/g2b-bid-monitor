/**
 * 단일 공고에 대해 g2b OpenAPI 를 직접 호출해 attachments 필드를 채운다.
 *
 * 기존 DB 에 이미 수집돼 있지만 attachments=null 인 공고들을 테스트 가능 상태로
 * 만들기 위한 one-off 헬퍼. upsertBid 는 중복 시 update 를 안 하므로
 * 여기서는 직접 update 로 attachments 만 덮어쓴다.
 *
 * 사용법:
 *   G2B_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
 *     npx tsx scripts/refresh-one-bid.ts R26BK01459045
 */

import axios from 'axios';
import { getSupabase } from '../lib/supabase';
import { G2B_API, ENV } from '../lib/config';

function extractAttachmentUrls(item: any): any[] {
  const out: any[] = [];
  const stdUrl = item.stdNtceDocUrl;
  if (stdUrl && String(stdUrl).trim()) {
    out.push({
      sourceIdx: 0,
      fileName: '표준공고문',
      sourceUrl: String(stdUrl).trim(),
      status: 'PENDING',
    });
  }
  for (let i = 1; i <= 10; i++) {
    const name = item[`ntceSpecFileNm${i}`];
    const url = item[`ntceSpecDocUrl${i}`];
    if (url && String(url).trim()) {
      out.push({
        sourceIdx: i,
        fileName: name ? String(name).trim() : `file_${i}`,
        sourceUrl: String(url).trim(),
        status: 'PENDING',
      });
    }
  }
  return out;
}

async function main() {
  const bidNtceNo = process.argv[2];
  if (!bidNtceNo) {
    console.error('usage: refresh-one-bid.ts <bid_ntce_no>');
    process.exit(1);
  }

  const sb = getSupabase();
  const { data: bid } = await sb
    .from('bids')
    .select('id, bid_ntce_no, bid_ntce_nm, bid_ntce_dt, bid_clse_dt')
    .eq('bid_ntce_no', bidNtceNo)
    .maybeSingle();

  if (!bid) {
    console.error(`❌ bid not found: ${bidNtceNo}`);
    process.exit(1);
  }

  console.log(`📋 ${bid.bid_ntce_no} — ${bid.bid_ntce_nm}`);

  // bid_ntce_dt 기준 ±3일 범위로 조회. DB에는 'YYYY-MM-DD HH:MM:SS' 형식으로 저장됨.
  const bidDate = bid.bid_ntce_dt || '';
  const d = new Date(bidDate.replace(' ', 'T'));
  if (isNaN(d.getTime())) {
    console.error(`❌ cannot parse bid_ntce_dt: ${bidDate}`);
    process.exit(1);
  }
  const fmt = (t: Date, end = false) => {
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const dd = String(t.getDate()).padStart(2, '0');
    return `${y}${m}${dd}${end ? '2359' : '0000'}`;
  };
  const start = new Date(d);
  start.setDate(start.getDate() - 2);
  const end = new Date(d);
  end.setDate(end.getDate() + 2);

  const baseUrl = `${G2B_API.BASE_URL}${G2B_API.SERVC_LIST}?ServiceKey=${ENV.G2B_API_KEY}`;
  console.log(`🔍 fetching OpenAPI (${fmt(start)} ~ ${fmt(end, true)})`);

  const { data } = await axios.get(baseUrl, {
    params: {
      pageNo: 1,
      numOfRows: 100,
      type: 'json',
      inqryDiv: 1,
      inqryBgnDt: fmt(start),
      inqryEndDt: fmt(end, true),
      bidNtceNo: bid.bid_ntce_no,
    },
    timeout: 30_000,
  });

  const body = data?.response?.body;
  const items = body?.items;
  let itemList: any[] = [];
  if (Array.isArray(items)) itemList = items;
  else if (items?.item)
    itemList = Array.isArray(items.item) ? items.item : [items.item];

  const match = itemList.find((i) => i.bidNtceNo === bid.bid_ntce_no);
  if (!match) {
    console.error(`❌ not in OpenAPI response (${itemList.length} items checked)`);
    console.log('첫 응답 샘플 필드:', Object.keys(itemList[0] ?? {}).filter(k => k.startsWith('ntceSpecDoc')));
    process.exit(1);
  }

  const attachments = extractAttachmentUrls(match);
  console.log(`\n📎 추출된 첨부: ${attachments.length}건`);
  attachments.forEach((a, i) => console.log(`  ${i + 1}. ${a.fileName}`));

  if (attachments.length === 0) {
    console.log('⚠️  첨부 없음 — 이 공고는 테스트 대상 아님');
    return;
  }

  const { error } = await sb
    .from('bids')
    .update({ attachments, attachments_status: 'PENDING' })
    .eq('bid_ntce_no', bid.bid_ntce_no);
  if (error) {
    console.error('❌ update failed:', error.message);
    process.exit(1);
  }
  console.log('✅ attachments 필드 업데이트 완료');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
