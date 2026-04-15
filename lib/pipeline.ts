import { getBidById, getBidsForPipeline, savePipelineResult, Bid } from './db';
import { generateChecklist, BidChecklist } from './checklist-generator';
import { generatePriceAdvice, PriceAdvice } from './price-advisor';
import { generateAllProposals, GenerationResult, DOC_TYPES } from './proposal-generator';
import { fetchAndParseAttachments } from './attachments/fetcher';
import { SCORE_THRESHOLD } from './config';

export interface PipelineResult {
  bid: Bid;
  checklist: BidChecklist | null;
  priceAdvice: PriceAdvice | null;
  proposals: GenerationResult[];
  errors: string[];
}

export interface PipelineSummary {
  total_processed: number;
  successful: number;
  failed: number;
  results: PipelineResult[];
}

export interface PipelineOptions {
  onLog?: (line: string) => void | Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function runBidPipeline(
  bidId: number,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const log = async (line: string) => {
    console.log(line);
    if (options.onLog) {
      try { await options.onLog(line); } catch {}
    }
  };

  const bid = await getBidById(bidId);
  if (!bid) throw new Error('공고를 찾을 수 없습니다');

  await log(`🚀 입찰 파이프라인 시작: ${bid.bid_ntce_nm.substring(0, 40)}`);

  const result: PipelineResult = {
    bid,
    checklist: null,
    priceAdvice: null,
    proposals: [],
    errors: [],
  };

  // 0단계: 첨부파일 다운로드 + 파싱 (공고문/규격서/제안요청서 등)
  // score >= ATTACHMENT_FETCH 조건은 runAutoPipeline 에서 이미 필터링되지만,
  // 수동 트리거 경로도 커버하기 위해 여기서도 점수 체크 후 스킵.
  if ((bid.total_score ?? 0) >= SCORE_THRESHOLD.ATTACHMENT_FETCH) {
    try {
      await log('📎 첨부파일 다운로드 + 파싱 시작');
      const attRes = await fetchAndParseAttachments(bid);
      await log(
        `✅ 첨부파일: 다운로드 ${attRes.downloaded}건 / 파싱 ${attRes.parsed}건 / 실패 ${attRes.failed}건`
      );
      // 후속 단계에서 최신 attachment_text 를 읽을 수 있도록 bid 객체 갱신
      const refreshed = await getBidById(bidId);
      if (refreshed) {
        result.bid = refreshed;
      }
    } catch (e: any) {
      result.errors.push(`첨부파일: ${e.message}`);
      await log(`❌ 첨부파일 단계 실패: ${e.message}`);
    }
  } else {
    await log(
      `⏭️  첨부파일 스킵 (total_score ${bid.total_score} < ${SCORE_THRESHOLD.ATTACHMENT_FETCH})`
    );
  }

  // 체크리스트·투찰가·제안서는 서로 독립적이므로 **전부 병렬로 실행**.
  // 순차 실행 시 약 5-6분 → 병렬 실행 시 가장 느린 한 단계(제안서 병렬)로 수렴 → 약 60-90초.
  // 300초 워커 한도 내에서 확실히 완주한다.
  const started = Date.now();
  await log('⚡ 파이프라인 3단계 병렬 실행 (체크리스트 + 투찰가 + 제안서 6종)');

  const [checklistRes, priceRes, proposalsRes] = await Promise.allSettled([
    (async () => {
      await log('📋 체크리스트 생성 중...');
      const c = await generateChecklist(bidId);
      await log(`✅ 체크리스트: ${c.items.length}개 항목 (준비 예상 ${c.estimated_prep_days}일)`);
      return c;
    })(),
    (async () => {
      await log('💰 투찰가격 추천 중...');
      const p = await generatePriceAdvice(bidId);
      await log(`✅ 투찰가 추천: ${p.recommended_bid_price.toLocaleString()}원 (${p.bid_rate}%)`);
      return p;
    })(),
    (async () => {
      await log(`📝 제안서 ${Object.keys(DOC_TYPES).length}종 병렬 생성 시작`);
      const results = await generateAllProposals(bidId, { onLog: options.onLog });
      const success = results.filter(p => p.success).length;
      await log(`✅ 제안서: ${success}/${results.length}건 완료`);
      return results;
    })(),
  ]);

  if (checklistRes.status === 'fulfilled') result.checklist = checklistRes.value;
  else {
    const msg = checklistRes.reason?.message || String(checklistRes.reason);
    result.errors.push(`체크리스트: ${msg}`);
    await log(`❌ 체크리스트 실패: ${msg}`);
  }

  if (priceRes.status === 'fulfilled') result.priceAdvice = priceRes.value;
  else {
    const msg = priceRes.reason?.message || String(priceRes.reason);
    result.errors.push(`투찰가격: ${msg}`);
    await log(`❌ 투찰가격 실패: ${msg}`);
  }

  if (proposalsRes.status === 'fulfilled') result.proposals = proposalsRes.value;
  else {
    const msg = proposalsRes.reason?.message || String(proposalsRes.reason);
    result.errors.push(`제안서: ${msg}`);
    await log(`❌ 제안서 실패: ${msg}`);
  }

  const totalSecs = ((Date.now() - started) / 1000).toFixed(1);

  // Persist pipeline result
  await savePipelineResult(bid.bid_ntce_no, {
    bid_id: bid.id || 0,
    checklist_json: result.checklist,
    price_advice_json: result.priceAdvice,
    proposal_status_json: result.proposals,
    errors_json: result.errors,
    status: result.errors.length === 0 ? 'SUCCESS' : 'PARTIAL',
  });

  await log(`🏁 파이프라인 완료: 에러 ${result.errors.length}건 (총 ${totalSecs}s)`);
  return result;
}

export async function runAutoPipeline(): Promise<PipelineSummary> {
  const goodBids = await getBidsForPipeline(SCORE_THRESHOLD.GOOD_FIT);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🤖 자동 입찰 파이프라인: ${goodBids.length}건 대상`);

  const summary: PipelineSummary = {
    total_processed: 0,
    successful: 0,
    failed: 0,
    results: [],
  };

  for (const bid of goodBids) {
    if (!bid.id) continue;
    try {
      const result = await runBidPipeline(bid.id);
      summary.results.push(result);
      summary.total_processed++;
      if (result.errors.length === 0) summary.successful++;
      else summary.failed++;
    } catch (error: any) {
      console.error(`❌ 파이프라인 에러: ${bid.bid_ntce_nm}: ${error.message}`);
      summary.failed++;
      summary.total_processed++;
    }
    await sleep(2000);
  }

  console.log(`\n🤖 자동 파이프라인 완료: 성공 ${summary.successful}건, 실패 ${summary.failed}건`);
  return summary;
}
