import express from 'express';
import cors from 'cors';
import { ENV, SCORE_THRESHOLD } from './config';
import { initDB, getBids, getBidById, getStats, toggleBookmark, getRecentLogs, getProposals, getProposal, savePipelineResult, getPipelineResult, getAllPipelineResults, getBidsForPipeline } from './db';
import { collectBids } from './collector';
import { analyzeBids } from './analyzer';
import { notifyNewBids, notifyPipelineResult, sendDeadlineReminder } from './notifier';
import { generateAllProposals, generateProposal, DOC_TYPES, DocType } from './proposal-generator';
import { saveProposal } from './db';
import { generateChecklist } from './checklist-generator';
import { generatePriceAdvice } from './price-advisor';
import { runBidPipeline } from './pipeline';

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

// POST /api/bids/:id/proposals/generate — 6종 전체 생성
app.post('/api/bids/:id/proposals/generate', (req, res) => {
  const id = parseInt(req.params.id);
  const bid = getBidById(id);
  if (!bid) return res.status(404).json({ error: 'Not found' });

  res.json({ message: '제안서 생성이 시작되었습니다', docTypes: Object.keys(DOC_TYPES) });

  (async () => {
    try {
      console.log(`📝 제안서 전체 생성 시작: ${bid.bid_ntce_nm.substring(0, 30)}`);
      const results = await generateAllProposals(id);
      const success = results.filter(r => r.success).length;
      console.log(`📝 제안서 생성 완료: ${success}/${results.length}건`);
    } catch (error: any) {
      console.error('❌ 제안서 생성 실패:', error.message);
    }
  })();
});

// POST /api/bids/:id/proposals/generate/:docType — 단건 생성
app.post('/api/bids/:id/proposals/generate/:docType', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const docType = req.params.docType as DocType;
    if (!DOC_TYPES[docType]) return res.status(400).json({ error: '유효하지 않은 문서 유형' });

    const bid = getBidById(id);
    if (!bid) return res.status(404).json({ error: 'Not found' });

    const content = await generateProposal(id, docType);
    saveProposal(bid.bid_ntce_no, docType, content);
    res.json({ docType, label: DOC_TYPES[docType], content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bids/:id/proposals — 문서 목록
app.get('/api/bids/:id/proposals', (req, res) => {
  try {
    const bid = getBidById(parseInt(req.params.id));
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const proposals = getProposals(bid.bid_ntce_no);
    res.json({ proposals, allTypes: DOC_TYPES });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/bids/:id/proposals/:docType — 단건 조회
app.get('/api/bids/:id/proposals/:docType', (req, res) => {
  try {
    const bid = getBidById(parseInt(req.params.id));
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const proposal = getProposal(bid.bid_ntce_no, req.params.docType);
    if (!proposal) return res.status(404).json({ error: '생성된 문서가 없습니다' });
    res.json({ docType: req.params.docType, label: DOC_TYPES[req.params.docType as DocType], ...proposal });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 입찰 파이프라인 API =====

// POST /api/bids/:id/pipeline — 단건 파이프라인 실행
app.post('/api/bids/:id/pipeline', (req, res) => {
  const id = parseInt(req.params.id);
  const bid = getBidById(id);
  if (!bid) return res.status(404).json({ error: 'Not found' });

  res.json({ message: '입찰 준비 파이프라인이 시작되었습니다', bid_ntce_no: bid.bid_ntce_no });

  (async () => {
    try {
      console.log(`🚀 수동 파이프라인 트리거: ${bid.bid_ntce_nm.substring(0, 30)}`);
      const result = await runBidPipeline(id);

      savePipelineResult(bid.bid_ntce_no, {
        bid_id: id,
        checklist_json: result.checklist ? JSON.stringify(result.checklist) : undefined,
        price_advice_json: result.priceAdvice ? JSON.stringify(result.priceAdvice) : undefined,
        proposal_status_json: JSON.stringify(result.proposals),
        errors_json: result.errors.length > 0 ? JSON.stringify(result.errors) : undefined,
        status: result.errors.length === 0 ? 'COMPLETE' : 'PARTIAL',
      });

      await notifyPipelineResult(result);
      console.log('✅ 수동 파이프라인 완료');
    } catch (error: any) {
      console.error('❌ 파이프라인 실패:', error.message);
    }
  })();
});

// GET /api/bids/:id/pipeline — 파이프라인 결과 조회
app.get('/api/bids/:id/pipeline', (req, res) => {
  try {
    const bid = getBidById(parseInt(req.params.id));
    if (!bid) return res.status(404).json({ error: 'Not found' });
    const result = getPipelineResult(bid.bid_ntce_no);
    if (!result) return res.status(404).json({ error: '파이프라인 결과가 없습니다' });

    res.json({
      ...result,
      checklist: result.checklist_json ? JSON.parse(result.checklist_json) : null,
      price_advice: result.price_advice_json ? JSON.parse(result.price_advice_json) : null,
      proposal_status: result.proposal_status_json ? JSON.parse(result.proposal_status_json) : null,
      errors: result.errors_json ? JSON.parse(result.errors_json) : [],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pipeline — 전체 파이프라인 결과 목록
app.get('/api/pipeline', (_req, res) => {
  try {
    const results = getAllPipelineResults();
    res.json(results.map((r: any) => ({
      ...r,
      checklist: r.checklist_json ? JSON.parse(r.checklist_json) : null,
      price_advice: r.price_advice_json ? JSON.parse(r.price_advice_json) : null,
      proposal_status: r.proposal_status_json ? JSON.parse(r.proposal_status_json) : null,
      errors: r.errors_json ? JSON.parse(r.errors_json) : [],
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bids/:id/checklist — 체크리스트만 생성
app.post('/api/bids/:id/checklist', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const checklist = await generateChecklist(id);
    res.json(checklist);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/bids/:id/price-advice — 투찰가격 추천만 생성
app.post('/api/bids/:id/price-advice', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const advice = await generatePriceAdvice(id);
    res.json(advice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/deadline-reminder — 마감 리마인더 수동 발송
app.post('/api/deadline-reminder', async (_req, res) => {
  try {
    const count = await sendDeadlineReminder();
    res.json({ sent: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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
