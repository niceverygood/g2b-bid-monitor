import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ENV } from '../../lib/config';
import { runAutoPipeline } from '../../lib/pipeline';
import { notifyPipelineResult } from '../../lib/notifier';

export const config = { maxDuration: 300 };

function isAuthorized(req: VercelRequest): boolean {
  const auth = req.headers.authorization || '';
  if (ENV.CRON_SECRET && auth === `Bearer ${ENV.CRON_SECRET}`) return true;
  if (req.headers['x-vercel-cron']) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const summary = await runAutoPipeline();
    for (const result of summary.results) {
      if (result.errors.length === 0) {
        await notifyPipelineResult(result).catch(() => {});
      }
    }
    res.json({
      processed: summary.total_processed,
      successful: summary.successful,
      failed: summary.failed,
    });
  } catch (error: any) {
    console.error('❌ Auto pipeline 실패:', error.message);
    res.status(500).json({ error: error.message });
  }
}
