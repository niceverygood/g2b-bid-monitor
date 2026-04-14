import type { VercelRequest, VercelResponse } from '@vercel/node';
import { toggleBookmark } from '../../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const id = parseInt(req.query.id as string);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const bookmarked = await toggleBookmark(id);
    res.json({ id, bookmarked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
