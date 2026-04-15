import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, toggleBookmark } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const key = (req.query.id as string)?.trim();
  if (!key) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const bookmarked = await toggleBookmark(bid.id!);
    res.json({ id: bid.id, bookmarked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
