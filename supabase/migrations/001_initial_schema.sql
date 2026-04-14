-- 바틀 입찰 모니터 초기 스키마 (Supabase Postgres)

-- 1. bids: 입찰 공고
CREATE TABLE IF NOT EXISTS bids (
  id BIGSERIAL PRIMARY KEY,
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
  presmpt_prce NUMERIC DEFAULT 0,
  dtl_prgs_sttus_nm TEXT,
  cntrct_mthd_nm TEXT,
  bid_ntce_dtl_url TEXT,
  ntce_kind_nm TEXT,
  bid_mthd_nm TEXT,
  srvc_div_nm TEXT,
  total_score INTEGER DEFAULT 0,
  scores_json JSONB,
  recommendation TEXT DEFAULT 'NOT_ANALYZED',
  summary TEXT,
  key_points_json JSONB,
  risks_json JSONB,
  suggested_strategy TEXT,
  bookmarked BOOLEAN DEFAULT FALSE,
  notified BOOLEAN DEFAULT FALSE,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bids_score ON bids(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_bids_clse ON bids(bid_clse_dt);
CREATE INDEX IF NOT EXISTS idx_bids_rec ON bids(recommendation);
CREATE INDEX IF NOT EXISTS idx_bids_collected ON bids(collected_at DESC);

-- 2. proposals: AI가 생성한 제안서
CREATE TABLE IF NOT EXISTS proposals (
  id BIGSERIAL PRIMARY KEY,
  bid_id BIGINT NOT NULL,
  bid_ntce_no TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bid_ntce_no, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_proposals_bid ON proposals(bid_ntce_no);

-- 3. pipeline_results: 파이프라인 실행 결과
CREATE TABLE IF NOT EXISTS pipeline_results (
  id BIGSERIAL PRIMARY KEY,
  bid_id BIGINT NOT NULL,
  bid_ntce_no TEXT UNIQUE NOT NULL,
  checklist_json JSONB,
  price_advice_json JSONB,
  proposal_status_json JSONB,
  errors_json JSONB,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_bid ON pipeline_results(bid_ntce_no);

-- 4. collection_logs: 수집 로그
CREATE TABLE IF NOT EXISTS collection_logs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  total_keywords INTEGER DEFAULT 0,
  total_collected INTEGER DEFAULT 0,
  new_bids INTEGER DEFAULT 0,
  analyzed INTEGER DEFAULT 0,
  notified INTEGER DEFAULT 0,
  status TEXT DEFAULT 'RUNNING',
  error_message TEXT
);

-- RLS 비활성화 (서비스 롤 키로 접근, 공개 API 아님)
ALTER TABLE bids DISABLE ROW LEVEL SECURITY;
ALTER TABLE proposals DISABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE collection_logs DISABLE ROW LEVEL SECURITY;
