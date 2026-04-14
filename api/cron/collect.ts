import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ENV } from '../../lib/config';
import { collectBids } from '../../lib/collector';
import { analyzeBids } from '../../lib/analyzer';
import { notifyNewBids } from '../../lib/notifier';
import { createLog, updateLog } from '../../lib/db';

export const config = { maxDuration: 300 };

function isAuthorized(req: VercelRequest): boolean {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.authorization || '';
  if (ENV.CRON_SECRET && auth === `Bearer ${ENV.CRON_SECRET}`) return true;
  // Allow Vercel's built-in cron header in dev/hobby
  if (req.headers['x-vercel-cron']) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const logId = await createLog();
  try {
    console.log('🔄 Cron: 수집 시작');
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
    console.error('❌ Cron 수집 실패:', error.message);
    await updateLog(logId, {
      finished_at: new Date().toISOString(),
      status: 'FAILED',
      error_message: error.message,
    });
    res.status(500).json({ error: error.message });
  }
}
