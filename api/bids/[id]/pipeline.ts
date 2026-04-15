import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, getPipelineResult } from '../../../lib/db';
import { runBidPipeline } from '../../../lib/pipeline';
import { notifyPipelineResult } from '../../../lib/notifier';
import { generateChecklist } from '../../../lib/checklist-generator';
import { generatePriceAdvice } from '../../../lib/price-advisor';
import { createJob, makeJobLogger, finishJob, failJob, listJobsForBid } from '../../../lib/jobs';

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
      const includeJobs = (req.query.include as string) === 'jobs';
      const jobs = includeJobs ? await listJobsForBid(bid.bid_ntce_no, 10) : undefined;

      if (!result) {
        if (includeJobs) return res.json({ status: 'NONE', jobs });
        return res.status(404).json({ error: '파이프라인 결과가 없습니다' });
      }
      return res.json({
        ...result,
        checklist: result.checklist_json || null,
        price_advice: result.price_advice_json || null,
        proposal_status: result.proposal_status_json || null,
        errors: result.errors_json || [],
        ...(includeJobs ? { jobs } : {}),
      });
    }

    if (req.method === 'POST') {
      const step = req.query.step as string;

      // Partial steps still run sync — they're fast.
      if (step === 'checklist') {
        const checklist = await generateChecklist(id);
        return res.json(checklist);
      }
      if (step === 'price-advice') {
        const advice = await generatePriceAdvice(id);
        return res.json(advice);
      }

      // Full pipeline: run in background. Return 202 + job_id immediately,
      // then keep the function alive while runBidPipeline completes. The
      // client polls GET /api/jobs/:id for status + live logs.
      const jobId = await createJob(id, bid.bid_ntce_no, 'pipeline', bid.bid_ntce_nm);
      res.status(202).json({
        job_id: jobId,
        status: 'running',
        bid_ntce_no: bid.bid_ntce_no,
        poll_url: `/api/jobs/${jobId}`,
      });

      try {
        const logger = makeJobLogger(jobId);
        const result = await runBidPipeline(id, { onLog: logger });
        const status = result.errors.length === 0 ? 'success' : 'partial';
        await finishJob(
          jobId,
          status,
          {
            bid_ntce_no: bid.bid_ntce_no,
            checklist: result.checklist,
            price_advice: result.priceAdvice,
            proposals: result.proposals,
            errors: result.errors,
          },
          '🏁 파이프라인 완료'
        );
        await notifyPipelineResult(result).catch(() => {});
      } catch (error: any) {
        await failJob(jobId, error?.message || String(error));
      }
      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}
