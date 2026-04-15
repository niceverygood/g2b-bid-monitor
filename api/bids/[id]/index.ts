import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveBid, toggleBookmark } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const key = (req.query.id as string)?.trim();
  if (!key) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bid = await resolveBid(key);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'GET') {
      return res.json(bid);
    }

    if (req.method === 'POST') {
      // POST /api/bids/:id?action=bookmark
      const action = req.query.action as string;
      if (action === 'bookmark') {
        const bookmarked = await toggleBookmark(bid.id!);
        return res.json({ id: bid.id, bookmarked });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
