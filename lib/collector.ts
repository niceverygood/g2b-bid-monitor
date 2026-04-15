import axios from 'axios';
import { ENV, SEARCH_KEYWORDS, EXCLUDE_KEYWORDS, G2B_API } from './config';
import { upsertBid, Bid } from './db';

export interface CollectionResult {
  totalKeywords: number;
  totalRawCount: number;
  uniqueCount: number;
  newBids: number;
  excludedCount: number;
  errors: string[];
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  params: Record<string, string | number>,
  retries: number = G2B_API.RETRY_COUNT
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios.get(url, { params, timeout: 30000 });
      return response.data;
    } catch (error: any) {
      console.warn(`  ⚠️ API 호출 실패 (${i + 1}/${retries}): ${error.message}`);
      if (i < retries - 1) {
        await sleep(Math.pow(2, i) * 1000);
      } else {
        throw error;
      }
    }
  }
}

function isExcluded(name: string): boolean {
  return EXCLUDE_KEYWORDS.some(kw => name.includes(kw));
}

/**
 * OpenAPI 응답의 ntceSpecFileNm1~10 / ntceSpecDocUrl1~10 에서
 * 규격서/공고문 직링크들을 추출한다. 추가로 stdNtceDocUrl (표준 공고문)이
 * 있으면 sourceIdx=0 으로 포함한다.
 *
 * 이 URL들은 사전 서명된 g2b 파일 서버 링크이므로 세션/AES 암호화 없이
 * 바로 다운로드 가능 — Playwright 없이 순수 HTTP fetch 만으로 처리 가능하다.
 *
 * 결과는 attachments JSONB (AttachmentEntry[]) 형태로 저장.
 */
function extractAttachmentUrls(item: any): AttachmentEntry[] {
  const out: AttachmentEntry[] = [];

  // 표준 공고문 (있으면 idx=0 으로)
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

export interface AttachmentEntry {
  sourceIdx: number;
  fileName: string;
  sourceUrl: string;
  status: 'PENDING' | 'DOWNLOADED' | 'PARSED' | 'FAILED' | 'NEEDS_WORKER';
  storagePath?: string;
  mime?: string;
  fileSize?: number;
  error?: string;
  downloadedAt?: string;
  parsedAt?: string;
}

function mapApiBidToDb(item: any): Partial<Bid> & { attachments?: AttachmentEntry[] } {
  const attachments = extractAttachmentUrls(item);
  return {
    bid_ntce_no: item.bidNtceNo || '',
    bid_ntce_ord: item.bidNtceOrd || '',
    bid_ntce_nm: item.bidNtceNm || '',
    ntce_instt_nm: item.ntceInsttNm || '',
    ntce_instt_cd: item.ntceInsttCd || '',
    dminstt_nm: item.dminsttNm || '',
    dminstt_cd: item.dminsttCd || '',
    bid_ntce_dt: item.bidNtceDt || '',
    bid_clse_dt: item.bidClseDt || '',
    openg_dt: item.opengDt || '',
    presmpt_prce: item.presmptPrce ? Number(item.presmptPrce) : 0,
    dtl_prgs_sttus_nm: item.dtlPrgsSttusNm || '',
    cntrct_mthd_nm: item.cntrctCnclsMthdNm || '',
    bid_ntce_dtl_url: item.bidNtceDtlUrl || '',
    ntce_kind_nm: item.ntceKindNm || '',
    bid_mthd_nm: item.bidMethdNm || '',
    srvc_div_nm: item.srvceDivNm || '',
    attachments: attachments.length ? attachments : undefined,
  };
}

export async function collectBids(options?: {
  startDate?: string;
  endDate?: string;
  keywords?: string[];
}): Promise<CollectionResult> {
  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const startDate = options?.startDate || `${formatDate(threeDaysAgo)}0000`;
  const endDate = options?.endDate || `${formatDate(now)}2359`;
  const keywords = options?.keywords || SEARCH_KEYWORDS;

  const result: CollectionResult = {
    totalKeywords: keywords.length,
    totalRawCount: 0,
    uniqueCount: 0,
    newBids: 0,
    excludedCount: 0,
    errors: [],
  };

  const bidMap = new Map<string, Partial<Bid>>();

  console.log(`📥 수집 시작: ${startDate} ~ ${endDate} (${keywords.length}개 키워드)`);

  for (const keyword of keywords) {
    try {
      const baseUrl = `${G2B_API.BASE_URL}${G2B_API.SERVC_LIST}?ServiceKey=${ENV.G2B_API_KEY}`;
      const data = await fetchWithRetry(baseUrl, {
        pageNo: 1,
        numOfRows: G2B_API.ROWS_PER_PAGE,
        type: 'json',
        inqryDiv: 1,
        inqryBgnDt: startDate,
        inqryEndDt: endDate,
        bidNtceNm: keyword,
      });

      const body = data?.response?.body;
      const items = body?.items;
      let itemList: any[] = [];

      if (Array.isArray(items)) {
        itemList = items;
      } else if (items && typeof items === 'object' && Array.isArray(items.item)) {
        itemList = items.item;
      } else if (items && typeof items === 'object' && items.item) {
        itemList = [items.item];
      }

      const count = itemList.length;
      result.totalRawCount += count;
      console.log(`  🔍 "${keyword}": ${count}건`);

      for (const item of itemList) {
        const bid = mapApiBidToDb(item);
        if (bid.bid_ntce_no && !bidMap.has(bid.bid_ntce_no)) {
          bidMap.set(bid.bid_ntce_no, bid);
        }
      }

      await sleep(G2B_API.CALL_INTERVAL_MS);
    } catch (error: any) {
      const msg = `키워드 "${keyword}" 수집 실패: ${error.message}`;
      console.error(`  ❌ ${msg}`);
      result.errors.push(msg);
    }
  }

  for (const [, bid] of bidMap) {
    if (isExcluded(bid.bid_ntce_nm || '')) {
      result.excludedCount++;
      continue;
    }
    const isNew = await upsertBid(bid);
    if (isNew) result.newBids++;
  }

  result.uniqueCount = bidMap.size - result.excludedCount;

  console.log(
    `\n📊 수집 완료: 전체 ${result.totalRawCount}건 → 유니크 ${bidMap.size}건 → 제외 ${result.excludedCount}건 → 저장 ${result.uniqueCount}건 (신규 ${result.newBids}건)`
  );
  if (result.errors.length > 0) console.log(`⚠️ 에러 ${result.errors.length}건`);

  return result;
}
