/**
 * score>=70 공고들을 순회하며 OpenAPI 에서 attachments 를 채우고,
 * HWP 5.x (.hwp, not .hwpx) 파일이 포함된 공고를 찾는다.
 */
import axios from 'axios';
import { getSupabase } from '../lib/supabase';
import { G2B_API, ENV } from '../lib/config';

function extractAttachments(item: any): { idx: number; name: string; url: string }[] {
  const out: any[] = [];
  const std = item.stdNtceDocUrl;
  if (std && String(std).trim()) out.push({ idx: 0, name: '표준공고문', url: String(std).trim() });
  for (let i = 1; i <= 10; i++) {
    const name = item[`ntceSpecFileNm${i}`];
    const url = item[`ntceSpecDocUrl${i}`];
    if (url && String(url).trim()) {
      out.push({ idx: i, name: name ? String(name).trim() : `file_${i}`, url: String(url).trim() });
    }
  }
  return out;
}

function fmt(t: Date, end = false) {
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${y}${m}${dd}${end ? '2359' : '0000'}`;
}

async function fetchFromOpenApi(bidNtceNo: string, bidDate: string) {
  const d = new Date(bidDate.replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  const start = new Date(d); start.setDate(start.getDate() - 2);
  const end = new Date(d); end.setDate(end.getDate() + 2);
  const baseUrl = `${G2B_API.BASE_URL}${G2B_API.SERVC_LIST}?ServiceKey=${ENV.G2B_API_KEY}`;
  try {
    const { data } = await axios.get(baseUrl, {
      params: {
        pageNo: 1, numOfRows: 100, type: 'json', inqryDiv: 1,
        inqryBgnDt: fmt(start), inqryEndDt: fmt(end, true), bidNtceNo,
      },
      timeout: 30_000,
    });
    const body = data?.response?.body;
    const items = body?.items;
    let list: any[] = [];
    if (Array.isArray(items)) list = items;
    else if (items?.item) list = Array.isArray(items.item) ? items.item : [items.item];
    return list.find((i) => i.bidNtceNo === bidNtceNo) ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const sb = getSupabase();
  const { data: bids } = await sb
    .from('bids')
    .select('id, bid_ntce_no, bid_ntce_nm, bid_ntce_dt, total_score, attachments, attachments_status')
    .gte('total_score', 70)
    .order('total_score', { ascending: false })
    .limit(50);

  if (!bids?.length) {
    console.log('no bids found');
    return;
  }
  console.log(`scanning ${bids.length} bids (score>=70)…\n`);

  const candidates: { bid: any; hwp5: string[]; all: string[] }[] = [];

  for (const bid of bids) {
    // 이미 attachments 가 있고 그 안에 .hwp (not .hwpx) 있으면 스킵하지 말고 바로 후보
    let atts: any[] | null = Array.isArray(bid.attachments) ? bid.attachments : null;
    if (!atts || atts.length === 0) {
      const item = await fetchFromOpenApi(bid.bid_ntce_no, bid.bid_ntce_dt);
      if (!item) { process.stdout.write('·'); continue; }
      atts = extractAttachments(item).map(a => ({ sourceIdx: a.idx, fileName: a.name, sourceUrl: a.url, status: 'PENDING' }));
    }

    const names: string[] = (atts as any[]).map((a) => a.fileName || '');
    const hwp5 = names.filter((n) => /\.hwp($|\?)/i.test(n) && !/\.hwpx/i.test(n));
    if (hwp5.length > 0) {
      candidates.push({ bid, hwp5, all: names });
      process.stdout.write('!');
    } else {
      process.stdout.write('.');
    }
  }

  console.log('\n');
  if (candidates.length === 0) {
    console.log('❌ no HWP 5.x candidate found');
    return;
  }

  console.log(`✅ ${candidates.length} bids with HWP 5.x attachments:\n`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`  ${c.bid.bid_ntce_no}  score=${c.bid.total_score}  — ${c.bid.bid_ntce_nm}`);
    c.all.forEach((n) => console.log(`    - ${n}${/\.hwp$/i.test(n) ? '  ⭐HWP5' : ''}`));
    console.log();
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
