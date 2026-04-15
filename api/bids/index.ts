import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBids } from '../../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const q = req.query;
    const filters = {
      page: parseInt((q.page as string) || '1'),
      limit: parseInt((q.limit as string) || '20'),
      sort: (q.sort as string) || 'totalScore',
      order: (q.order as string) || 'desc',
      recommendation: q.recommendation as string | undefined,
      keyword: q.keyword as string | undefined,
      minScore: q.minScore ? parseInt(q.minScore as string) : undefined,
      bookmarked: q.bookmarked === 'true',
      status: (q.status as string) || 'all',
      withinDays: q.withinDays ? parseInt(q.withinDays as string) : undefined,
    };

    const { data, total } = await getBids(filters);
    const totalPages = Math.ceil(total / filters.limit);

    res.json({
      data,
      pagination: { page: filters.page, limit: filters.limit, total, totalPages },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
