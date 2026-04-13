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

// ===== 제안서 HTML 뷰 (Slack 링크용) =====

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(md: string): string {
  // 경량 마크다운 렌더러: 헤더, bold, italic, 코드, 리스트, 표, 구분선, 단락
  const lines = md.split('\n');
  const html: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeader: string[] = [];

  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

  const closeList = () => { if (inList) { html.push('</ul>'); inList = false; } };
  const closeTable = () => { if (inTable) { html.push('</tbody></table>'); inTable = false; tableHeader = []; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { closeList(); closeTable(); continue; }

    // 구분선
    if (/^-{3,}$/.test(trimmed) || /^={3,}$/.test(trimmed)) {
      closeList(); closeTable();
      html.push('<hr/>');
      continue;
    }

    // 헤더
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      closeList(); closeTable();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }

    // 표
    if (/^\|.*\|$/.test(trimmed)) {
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      // 다음 줄이 구분선이면 헤더
      const next = (lines[i + 1] || '').trim();
      if (!inTable && /^\|[\s\-:|]+\|$/.test(next)) {
        closeList();
        inTable = true;
        tableHeader = cells;
        html.push('<table><thead><tr>' + cells.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
        i++; // 구분선 건너뛰기
        continue;
      }
      if (inTable) {
        html.push('<tr>' + cells.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>');
        continue;
      }
    } else {
      closeTable();
    }

    // 리스트
    const li = trimmed.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    const ol = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ol) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(ol[2])}</li>`);
      continue;
    }
    closeList();

    // 단락
    html.push(`<p>${inline(trimmed)}</p>`);
  }
  closeList(); closeTable();
  return html.join('\n');
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { max-width: 800px; margin: 0 auto; padding: 24px 20px 80px; background: #0B1220; color: #E2E8F0; font-family: -apple-system, 'Segoe UI', 'Noto Sans KR', sans-serif; line-height: 1.7; }
  a { color: #60A5FA; }
  h1 { font-size: 26px; border-bottom: 2px solid #1E293B; padding-bottom: 10px; margin-top: 28px; }
  h2 { font-size: 20px; margin-top: 28px; color: #93C5FD; }
  h3 { font-size: 17px; margin-top: 20px; color: #CBD5E1; }
  h4, h5, h6 { margin-top: 16px; color: #CBD5E1; }
  p { margin: 10px 0; }
  ul { padding-left: 22px; }
  li { margin: 4px 0; }
  code { background: #1E293B; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  hr { border: 0; border-top: 1px solid #1E293B; margin: 24px 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
  th, td { border: 1px solid #1E293B; padding: 8px 10px; text-align: left; }
  th { background: #111827; color: #93C5FD; }
  .nav { margin-bottom: 20px; font-size: 13px; color: #64748B; }
  .nav a { margin-right: 12px; }
  .meta { color: #64748B; font-size: 12px; margin-bottom: 20px; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// GET /proposals/:bidNtceNo — 제안서 인덱스 페이지
app.get('/proposals/:bidNtceNo', (req, res) => {
  const bidNtceNo = req.params.bidNtceNo;
  const proposals = getProposals(bidNtceNo);

  if (proposals.length === 0) {
    return res.type('html').send(htmlPage('제안서 없음',
      `<h1>제안서가 없습니다</h1><p>공고번호 <code>${escapeHtml(bidNtceNo)}</code>에 대해 생성된 제안서가 없습니다.</p>`));
  }

  const items = (Object.entries(DOC_TYPES) as [DocType, string][])
    .map(([type, label]) => {
      const exists = proposals.find(p => p.doc_type === type);
      if (exists) {
        return `<li><a href="/proposals/${encodeURIComponent(bidNtceNo)}/${type}">📄 ${label}</a> <span class="meta">${exists.created_at}</span></li>`;
      }
      return `<li><span class="meta">📄 ${label} (미생성)</span></li>`;
    }).join('\n');

  res.type('html').send(htmlPage(`제안서 — ${bidNtceNo}`,
    `<h1>📝 제안서 목록</h1>
     <p class="meta">공고번호: ${escapeHtml(bidNtceNo)}</p>
     <ul>${items}</ul>`));
});

// GET /proposals/:bidNtceNo/:docType — 제안서 단건 HTML 뷰
app.get('/proposals/:bidNtceNo/:docType', (req, res) => {
  const { bidNtceNo, docType } = req.params;
  const proposal = getProposal(bidNtceNo, docType);
  const label = DOC_TYPES[docType as DocType] || docType;

  if (!proposal) {
    return res.status(404).type('html').send(htmlPage('문서 없음',
      `<div class="nav"><a href="/proposals/${encodeURIComponent(bidNtceNo)}">← 목록</a></div>
       <h1>${escapeHtml(label)}</h1>
       <p>아직 생성되지 않은 문서입니다.</p>`));
  }

  const body = `
<div class="nav"><a href="/proposals/${encodeURIComponent(bidNtceNo)}">← 제안서 목록</a></div>
<p class="meta">공고번호: ${escapeHtml(bidNtceNo)} · 생성: ${escapeHtml(proposal.created_at)}</p>
${renderMarkdown(proposal.content)}
`;
  res.type('html').send(htmlPage(label, body));
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
