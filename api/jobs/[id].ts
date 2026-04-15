import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJob } from '../../lib/jobs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = (req.query.id as string)?.trim();
  const jobId = parseInt(raw, 10);
  if (!jobId || Number.isNaN(jobId)) {
    return res.status(400).json({ error: 'Invalid job id' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const job = await getJob(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // Optionally support ?tail=N to only return the last N log lines to
    // reduce payload for long-running jobs.
    const tailParam = req.query.tail as string | undefined;
    let logs = job.logs || '';
    if (tailParam) {
      const n = parseInt(tailParam, 10);
      if (n > 0) {
        const lines = logs.split('\n');
        logs = lines.slice(-n).join('\n');
      }
    }

    // Cache-busting for polling clients
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ...job, logs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
