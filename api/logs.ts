import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRecentLogs } from '../lib/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const logs = await getRecentLogs(20);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
