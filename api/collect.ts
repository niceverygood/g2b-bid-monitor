import type { VercelRequest, VercelResponse } from '@vercel/node';
import { collectBids } from '../lib/collector';
import { analyzeBids } from '../lib/analyzer';
import { notifyNewBids } from '../lib/notifier';
import { createLog, updateLog } from '../lib/db';

export const config = { maxDuration: 300 };

// Manual trigger — same job as /api/cron/collect but callable from frontend
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const logId = await createLog();
  try {
    const collectResult = await collectBids();
    const analyzeResult = await analyzeBids(15);
    const notified = await notifyNewBids();

    await updateLog(logId, {
      finished_at: new Date().toISOString(),
      total_keywords: collectResult.totalKeywords,
      total_collected: collectResult.uniqueCount,
      new_bids: collectResult.newBids,
      analyzed: analyzeResult.analyzed,
      notified,
      status: 'SUCCESS',
    });

    res.json({
      collected: collectResult.newBids,
      analyzed: analyzeResult.analyzed,
      notified,
    });
  } catch (error: any) {
    await updateLog(logId, {
      finished_at: new Date().toISOString(),
      status: 'FAILED',
      error_message: error.message,
    });
    res.status(500).json({ error: error.message });
  }
}
