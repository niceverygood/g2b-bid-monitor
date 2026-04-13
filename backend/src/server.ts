import express from 'express';
import cors from 'cors';
import { ENV } from './config';
import { initDB, getBids, getBidById, getStats, toggleBookmark, getRecentLogs } from './db';
import { collectBids } from './collector';
import { analyzeBids } from './analyzer';
import { notifyNewBids } from './notifier';

const app = express();

app.use(cors({ origin: ENV.FRONTEND_URL }));
app.use(express.json());

initDB();

// GET /api/bids
app.get('/api/bids', (req, res) => {
  try {
    const filters = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      sort: (req.query.sort as string) || 'totalScore',
      order: (req.query.order as string) || 'desc',
      recommendation: req.query.recommendation as string,
      keyword: req.query.keyword as string,
      minScore: req.query.minScore ? parseInt(req.query.minScore as string) : undefined,
      bookmarked: req.query.bookmarked === 'true',
      status: (req.query.status as string) || 'all',
    };

    const { data, total } = getBids(filters);
    const totalPages = Math.ceil(total / filters.limit);

    res.json({
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bids/:id
app.get('/api/bids/:id', (req, res) => {
  try {
    const bid = getBidById(parseInt(req.params.id));
    if (!bid) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(bid);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/stats
app.get('/api/stats', (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bids/:id/bookmark
app.post('/api/bids/:id/bookmark', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const bookmarked = toggleBookmark(id);
    res.json({ id, bookmarked: bookmarked === 1 });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/collect
app.post('/api/collect', (_req, res) => {
  res.json({ message: '수집이 시작되었습니다' });

  // 백그라운드 실행
  (async () => {
    try {
      console.log('🔄 수동 수집 트리거');
      await collectBids();
      await analyzeBids(15);
      await notifyNewBids();
      console.log('✅ 수동 수집 완료');
    } catch (error: any) {
      console.error('❌ 수동 수집 실패:', error.message);
    }
  })();
});

// GET /api/logs
app.get('/api/logs', (_req, res) => {
  try {
    const logs = getRecentLogs(20);
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// 전역 에러 핸들러
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('서버 에러:', err.message);
  res.status(500).json({ error: err.message });
});

app.listen(ENV.PORT, () => {
  console.log(`🌐 API 서버: http://localhost:${ENV.PORT}`);
});
