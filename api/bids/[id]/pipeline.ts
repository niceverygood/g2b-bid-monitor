import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, getPipelineResult } from '../../../lib/db';
import { runBidPipeline } from '../../../lib/pipeline';
import { notifyPipelineResult } from '../../../lib/notifier';
import { generateChecklist } from '../../../lib/checklist-generator';
import { generatePriceAdvice } from '../../../lib/price-advisor';

// maxDuration only applies on Pro plans. Full pipeline is long-running.
export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  if (!key) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const id = bid.id!;

    if (req.method === 'GET') {
      const result = await getPipelineResult(bid.bid_ntce_no);
      if (!result) return res.status(404).json({ error: '파이프라인 결과가 없습니다' });
      return res.json({
        ...result,
        checklist: result.checklist_json || null,
        price_advice: result.price_advice_json || null,
        proposal_status: result.proposal_status_json || null,
        errors: result.errors_json || [],
      });
    }

    if (req.method === 'POST') {
      const step = req.query.step as string;

      // Partial steps (sync response)
      if (step === 'checklist') {
        const checklist = await generateChecklist(id);
        return res.json(checklist);
      }
      if (step === 'price-advice') {
        const advice = await generatePriceAdvice(id);
        return res.json(advice);
      }

      // Full pipeline: run sync (Pro plan) and notify
      const result = await runBidPipeline(id);
      await notifyPipelineResult(result).catch(() => {});
      return res.json({
        bid_ntce_no: bid.bid_ntce_no,
        checklist: result.checklist,
        price_advice: result.priceAdvice,
        proposals: result.proposals,
        errors: result.errors,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
