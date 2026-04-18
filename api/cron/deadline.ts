import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ENV } from '../../lib/config';
import { sendDeadlineReminder } from '../../lib/notifier';

/**
 * 마감 임박 공고 알림 전용 cron.
 * (일일 리포트는 collect cron 이 수집 직후 함께 보내므로 여기선 생략.)
 */
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
    res.json({ deadline_reminders: sent });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
