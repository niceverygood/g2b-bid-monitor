import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJob, finishJob, failJob, makeJobLogger } from '../../../lib/jobs';
import { runBidPipeline } from '../../../lib/pipeline';
import { generateAllProposals } from '../../../lib/proposal-generator';
import { notifyPipelineResult } from '../../../lib/notifier';

// Long running. This worker is invoked via self-fetch from the parent
// handler (pipeline/proposals POST). Because this function is actively
// processing an HTTP request for the full duration, Vercel does NOT
// terminate it early — the old "continue after res.json()" pattern
// turned out to be unreliable on Vercel Lambda.
export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional shared-secret check. If WORKER_SECRET is set in the Vercel
  // env we require it; otherwise we allow any same-origin POST (the
  // parent handler is the only expected caller).
  const expected = process.env.WORKER_SECRET;
  if (expected) {
    const provided = (req.headers['x-worker-secret'] as string) || '';
    if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
  }

  const raw = (req.query.id as string)?.trim();
  const jobId = parseInt(raw, 10);
  if (!jobId || Number.isNaN(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  const job = await getJob(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'running') {
    return res.status(200).json({ ok: true, skipped: true, status: job.status });
  }

  const logger = makeJobLogger(jobId);

  try {
    if (job.kind === 'pipeline') {
      const result = await runBidPipeline(job.bid_id, { onLog: logger });
      const status = result.errors.length === 0 ? 'success' : 'partial';
      await finishJob(
        jobId,
        status,
        {
          bid_ntce_no: job.bid_ntce_no,
          checklist: result.checklist,
          price_advice: result.priceAdvice,
          proposals: result.proposals,
          errors: result.errors,
        },
        '🏁 파이프라인 완료'
      );
      notifyPipelineResult(result).catch(() => {});
    } else if (job.kind === 'proposals') {
      const results = await generateAllProposals(job.bid_id, { onLog: logger });
      const allOk = results.every(r => r.success);
      await finishJob(
        jobId,
        allOk ? 'success' : 'partial',
        { results },
        allOk ? '🏁 제안서 전체 생성 완료' : '🏁 제안서 생성 완료 (일부 실패)'
      );
    } else {
      await failJob(jobId, `Unsupported job kind: ${job.kind}`);
    }
  } catch (error: any) {
    await failJob(jobId, error?.message || String(error));
  }

  return res.status(200).json({ ok: true, job_id: jobId });
}
