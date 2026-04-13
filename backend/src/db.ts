import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface Bid {
  id?: number;
  bid_ntce_no: string;
  bid_ntce_ord?: string;
  bid_ntce_nm: string;
  ntce_instt_nm?: string;
  ntce_instt_cd?: string;
  dminstt_nm?: string;
  dminstt_cd?: string;
  bid_ntce_dt?: string;
  bid_clse_dt?: string;
  openg_dt?: string;
  presmpt_prce?: number;
  dtl_prgs_sttus_nm?: string;
  cntrct_mthd_nm?: string;
  bid_ntce_dtl_url?: string;
  ntce_kind_nm?: string;
  bid_mthd_nm?: string;
  srvc_div_nm?: string;
  total_score: number;
  scores_json?: string;
  recommendation: string;
  summary?: string;
  key_points_json?: string;
  risks_json?: string;
  suggested_strategy?: string;
  bookmarked: number;
  notified: number;
  collected_at?: string;
  analyzed_at?: string;
}

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'g2b.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

export function initDB(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bid_ntce_no TEXT UNIQUE NOT NULL,
      bid_ntce_ord TEXT,
      bid_ntce_nm TEXT NOT NULL,
      ntce_instt_nm TEXT,
      ntce_instt_cd TEXT,
      dminstt_nm TEXT,
      dminstt_cd TEXT,
      bid_ntce_dt TEXT,
      bid_clse_dt TEXT,
      openg_dt TEXT,
      presmpt_prce REAL DEFAULT 0,
      dtl_prgs_sttus_nm TEXT,
      cntrct_mthd_nm TEXT,
      bid_ntce_dtl_url TEXT,
      ntce_kind_nm TEXT,
      bid_mthd_nm TEXT,
      srvc_div_nm TEXT,
      total_score INTEGER DEFAULT 0,
      scores_json TEXT,
      recommendation TEXT DEFAULT 'NOT_ANALYZED',
      summary TEXT,
      key_points_json TEXT,
      risks_json TEXT,
      suggested_strategy TEXT,
      bookmarked INTEGER DEFAULT 0,
      notified INTEGER DEFAULT 0,
      collected_at TEXT DEFAULT (datetime('now','localtime')),
      analyzed_at TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_score ON bids(total_score DESC);
    CREATE INDEX IF NOT EXISTS idx_clse ON bids(bid_clse_dt);
    CREATE INDEX IF NOT EXISTS idx_rec ON bids(recommendation);

    CREATE TABLE IF NOT EXISTS collection_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT DEFAULT (datetime('now','localtime')),
      finished_at TEXT,
      total_keywords INTEGER DEFAULT 0,
      total_collected INTEGER DEFAULT 0,
      new_bids INTEGER DEFAULT 0,
      analyzed INTEGER DEFAULT 0,
      notified INTEGER DEFAULT 0,
      status TEXT DEFAULT 'RUNNING',
      error_message TEXT
    );
  `);
}

export function upsertBid(bid: Partial<Bid>): boolean {
  const existing = db.prepare('SELECT id FROM bids WHERE bid_ntce_no = ?').get(bid.bid_ntce_no);
  if (existing) {
    return false;
  }

  db.prepare(`
    INSERT OR IGNORE INTO bids (
      bid_ntce_no, bid_ntce_ord, bid_ntce_nm, ntce_instt_nm, ntce_instt_cd,
      dminstt_nm, dminstt_cd, bid_ntce_dt, bid_clse_dt, openg_dt,
      presmpt_prce, dtl_prgs_sttus_nm, cntrct_mthd_nm, bid_ntce_dtl_url,
      ntce_kind_nm, bid_mthd_nm, srvc_div_nm
    ) VALUES (
      @bid_ntce_no, @bid_ntce_ord, @bid_ntce_nm, @ntce_instt_nm, @ntce_instt_cd,
      @dminstt_nm, @dminstt_cd, @bid_ntce_dt, @bid_clse_dt, @openg_dt,
      @presmpt_prce, @dtl_prgs_sttus_nm, @cntrct_mthd_nm, @bid_ntce_dtl_url,
      @ntce_kind_nm, @bid_mthd_nm, @srvc_div_nm
    )
  `).run({
    bid_ntce_no: bid.bid_ntce_no || '',
    bid_ntce_ord: bid.bid_ntce_ord || null,
    bid_ntce_nm: bid.bid_ntce_nm || '',
    ntce_instt_nm: bid.ntce_instt_nm || null,
    ntce_instt_cd: bid.ntce_instt_cd || null,
    dminstt_nm: bid.dminstt_nm || null,
    dminstt_cd: bid.dminstt_cd || null,
    bid_ntce_dt: bid.bid_ntce_dt || null,
    bid_clse_dt: bid.bid_clse_dt || null,
    openg_dt: bid.openg_dt || null,
    presmpt_prce: bid.presmpt_prce || 0,
    dtl_prgs_sttus_nm: bid.dtl_prgs_sttus_nm || null,
    cntrct_mthd_nm: bid.cntrct_mthd_nm || null,
    bid_ntce_dtl_url: bid.bid_ntce_dtl_url || null,
    ntce_kind_nm: bid.ntce_kind_nm || null,
    bid_mthd_nm: bid.bid_mthd_nm || null,
    srvc_div_nm: bid.srvc_div_nm || null,
  });

  return true;
}

export function getUnanalyzedBids(limit: number = 20): Bid[] {
  return db.prepare(`
    SELECT * FROM bids
    WHERE analyzed_at IS NULL AND recommendation = 'NOT_ANALYZED'
    ORDER BY collected_at DESC
    LIMIT ?
  `).all(limit) as Bid[];
}

export function updateAnalysis(bidNtceNo: string, analysis: {
  total_score: number;
  scores_json: string;
  recommendation: string;
  summary: string;
  key_points_json: string;
  risks_json: string;
  suggested_strategy: string;
}): void {
  db.prepare(`
    UPDATE bids SET
      total_score = @total_score,
      scores_json = @scores_json,
      recommendation = @recommendation,
      summary = @summary,
      key_points_json = @key_points_json,
      risks_json = @risks_json,
      suggested_strategy = @suggested_strategy,
      analyzed_at = datetime('now','localtime')
    WHERE bid_ntce_no = @bid_ntce_no
  `).run({ ...analysis, bid_ntce_no: bidNtceNo });
}

export function getBids(filters: {
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
  recommendation?: string;
  keyword?: string;
  minScore?: number;
  bookmarked?: boolean;
  status?: string;
}): { data: Bid[]; total: number } {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  const sortMap: Record<string, string> = {
    totalScore: 'total_score',
    latest: 'bid_ntce_dt',
    deadline: 'bid_clse_dt',
    price: 'presmpt_prce',
  };
  const sortCol = sortMap[filters.sort || 'totalScore'] || 'total_score';
  const order = filters.order === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.recommendation) {
    conditions.push('recommendation = @recommendation');
    params.recommendation = filters.recommendation;
  }

  if (filters.keyword) {
    conditions.push('(bid_ntce_nm LIKE @keyword OR ntce_instt_nm LIKE @keyword OR dminstt_nm LIKE @keyword)');
    params.keyword = `%${filters.keyword}%`;
  }

  if (filters.minScore !== undefined) {
    conditions.push('total_score >= @minScore');
    params.minScore = filters.minScore;
  }

  if (filters.bookmarked) {
    conditions.push('bookmarked = 1');
  }

  if (filters.status === 'active') {
    conditions.push("bid_clse_dt > datetime('now','localtime')");
  } else if (filters.status === 'closed') {
    conditions.push("bid_clse_dt <= datetime('now','localtime')");
  }

  const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const total = (db.prepare(`SELECT COUNT(*) as cnt FROM bids ${whereClause}`).get(params) as { cnt: number }).cnt;

  const data = db.prepare(`
    SELECT * FROM bids ${whereClause}
    ORDER BY ${sortCol} ${order}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as Bid[];

  return { data, total };
}

export function getBidById(id: number): Bid | undefined {
  return db.prepare('SELECT * FROM bids WHERE id = ?').get(id) as Bid | undefined;
}

export function toggleBookmark(id: number): number {
  db.prepare('UPDATE bids SET bookmarked = CASE WHEN bookmarked = 0 THEN 1 ELSE 0 END WHERE id = ?').run(id);
  const row = db.prepare('SELECT bookmarked FROM bids WHERE id = ?').get(id) as { bookmarked: number } | undefined;
  return row?.bookmarked ?? 0;
}

export function getUnnotifiedBids(minScore: number): Bid[] {
  return db.prepare(`
    SELECT * FROM bids
    WHERE notified = 0 AND total_score >= ?
    ORDER BY total_score DESC
  `).all(minScore) as Bid[];
}

export function markNotified(bidNtceNo: string): void {
  db.prepare('UPDATE bids SET notified = 1 WHERE bid_ntce_no = ?').run(bidNtceNo);
}

export function getStats(): {
  total: number;
  todayNew: number;
  strongFit: number;
  goodFit: number;
  avgScore: number;
  urgentCount: number;
  recentCollectedAt: string | null;
} {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM bids').get() as { cnt: number }).cnt;
  const todayNew = (db.prepare("SELECT COUNT(*) as cnt FROM bids WHERE date(collected_at) = date('now','localtime')").get() as { cnt: number }).cnt;
  const strongFit = (db.prepare("SELECT COUNT(*) as cnt FROM bids WHERE recommendation = 'STRONG_FIT'").get() as { cnt: number }).cnt;
  const goodFit = (db.prepare("SELECT COUNT(*) as cnt FROM bids WHERE recommendation = 'GOOD_FIT'").get() as { cnt: number }).cnt;
  const avgRow = db.prepare('SELECT AVG(total_score) as avg FROM bids WHERE total_score > 0').get() as { avg: number | null };
  const avgScore = Math.round(avgRow?.avg || 0);
  const urgentCount = (db.prepare(`
    SELECT COUNT(*) as cnt FROM bids
    WHERE bid_clse_dt > datetime('now','localtime')
    AND bid_clse_dt <= datetime('now','localtime','+3 days')
  `).get() as { cnt: number }).cnt;
  const recentRow = db.prepare('SELECT collected_at FROM bids ORDER BY collected_at DESC LIMIT 1').get() as { collected_at: string } | undefined;

  return {
    total,
    todayNew,
    strongFit,
    goodFit,
    avgScore,
    urgentCount,
    recentCollectedAt: recentRow?.collected_at || null,
  };
}

export function createLog(): number {
  const result = db.prepare('INSERT INTO collection_logs DEFAULT VALUES').run();
  return result.lastInsertRowid as number;
}

export function updateLog(id: number, data: Record<string, unknown>): void {
  const fields = Object.keys(data).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE collection_logs SET ${fields} WHERE id = @id`).run({ ...data, id });
}

export function cleanOldBids(days: number): number {
  const result = db.prepare(`
    DELETE FROM bids
    WHERE collected_at < datetime('now','localtime','-' || ? || ' days')
    AND bookmarked = 0
  `).run(days);
  return result.changes;
}

export function getRecentLogs(limit: number = 20) {
  return db.prepare('SELECT * FROM collection_logs ORDER BY started_at DESC LIMIT ?').all(limit);
}
