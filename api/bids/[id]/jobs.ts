import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid } from '../../../lib/db';
import { listJobsForBid } from '../../../lib/jobs';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  if (!key) return res.status(400).json({ error: 'Invalid id' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    const limit = parseInt((req.query.limit as string) || '20', 10);
    const jobs = await listJobsForBid(bid.bid_ntce_no, Math.min(limit, 100));
    res.setHeader('Cache-Control', 'no-store');
    res.json({ jobs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
