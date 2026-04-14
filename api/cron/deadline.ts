import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ENV } from '../../lib/config';
import { sendDeadlineReminder, sendDailySummary } from '../../lib/notifier';

function isAuthorized(req: VercelRequest): boolean {
  const auth = req.headers.authorization || '';
  if (ENV.CRON_SECRET && auth === `Bearer ${ENV.CRON_SECRET}`) return true;
  if (req.headers['x-vercel-cron']) return true;
  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const sent = await sendDeadlineReminder();
    // 일일 요약은 아침 타임에만
    const hour = new Date().getHours();
    if (hour >= 7 && hour <= 9) {
      await sendDailySummary();
    }
    res.json({ deadline_reminders: sent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
