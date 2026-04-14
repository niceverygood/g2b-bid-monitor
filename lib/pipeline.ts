import { getBidById, getBidsForPipeline, savePipelineResult, Bid } from './db';
import { generateChecklist, BidChecklist } from './checklist-generator';
import { generatePriceAdvice, PriceAdvice } from './price-advisor';
import { generateAllProposals, GenerationResult } from './proposal-generator';
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

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function runBidPipeline(bidId: number): Promise<PipelineResult> {
  const bid = await getBidById(bidId);
  if (!bid) throw new Error('공고를 찾을 수 없습니다');

  console.log(`\n🚀 입찰 파이프라인 시작: ${bid.bid_ntce_nm.substring(0, 40)}`);

  const result: PipelineResult = {
    bid,
    checklist: null,
    priceAdvice: null,
    proposals: [],
    errors: [],
  };

  try {
    console.log('  📋 체크리스트 생성 중...');
    result.checklist = await generateChecklist(bidId);
    console.log(`  ✅ 체크리스트: ${result.checklist.items.length}개 항목`);
  } catch (error: any) {
    result.errors.push(`체크리스트: ${error.message}`);
    console.error(`  ❌ 체크리스트 실패: ${error.message}`);
  }

  await sleep(1000);

  try {
    console.log('  💰 투찰가격 추천 중...');
    result.priceAdvice = await generatePriceAdvice(bidId);
    console.log(`  ✅ 투찰가 추천: ${result.priceAdvice.bid_rate}%`);
  } catch (error: any) {
    result.errors.push(`투찰가격: ${error.message}`);
    console.error(`  ❌ 투찰가격 실패: ${error.message}`);
  }

  await sleep(1000);

  try {
    console.log('  📝 제안서 6종 생성 중...');
    result.proposals = await generateAllProposals(bidId);
    const success = result.proposals.filter(p => p.success).length;
    console.log(`  ✅ 제안서: ${success}/${result.proposals.length}건 완료`);
  } catch (error: any) {
    result.errors.push(`제안서: ${error.message}`);
    console.error(`  ❌ 제안서 실패: ${error.message}`);
  }

  // Persist pipeline result
  await savePipelineResult(bid.bid_ntce_no, {
    bid_id: bid.id || 0,
    checklist_json: result.checklist,
    price_advice_json: result.priceAdvice,
    proposal_status_json: result.proposals,
    errors_json: result.errors,
    status: result.errors.length === 0 ? 'SUCCESS' : 'PARTIAL',
  });

  console.log(`🏁 파이프라인 완료: 에러 ${result.errors.length}건`);
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
