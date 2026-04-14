import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getStats } from '../lib/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
