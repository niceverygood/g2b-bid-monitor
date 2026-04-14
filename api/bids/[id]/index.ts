import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBidById, toggleBookmark } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseInt(req.query.id as string);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    if (req.method === 'GET') {
      const bid = await getBidById(id);
      if (!bid) return res.status(404).json({ error: 'Not found' });
      return res.json(bid);
    }

    if (req.method === 'POST') {
      // POST /api/bids/:id?action=bookmark
      const action = req.query.action as string;
      if (action === 'bookmark') {
        const bookmarked = await toggleBookmark(id);
        return res.json({ id, bookmarked });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
