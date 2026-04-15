import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, getPipelineResult } from '../../../lib/db';
import { generateChecklist } from '../../../lib/checklist-generator';
import { generatePriceAdvice } from '../../../lib/price-advisor';
import { createJob, dispatchJobWorker, listJobsForBid } from '../../../lib/jobs';

// The actual pipeline runs in /api/jobs/[id]/run (see worker). This
// handler is just a dispatcher so maxDuration can be short.
export const config = { maxDuration: 10 };

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

      // Full pipeline: create job row, fire the worker endpoint via
      // self-fetch, return 202 immediately. The worker at
      // /api/jobs/:id/run executes runBidPipeline with its own 300s
      // budget and streams logs into the job row.
      const jobId = await createJob(id, bid.bid_ntce_no, 'pipeline', bid.bid_ntce_nm);
      await dispatchJobWorker(jobId, { host: req.headers.host });
      return res.status(202).json({
        job_id: jobId,
        status: 'running',
        bid_ntce_no: bid.bid_ntce_no,
        poll_url: `/api/jobs/${jobId}`,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
}
