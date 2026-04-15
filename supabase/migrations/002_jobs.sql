-- 002_jobs.sql — 비동기 백그라운드 작업 큐 + 실시간 로그
-- 파이프라인/제안서 생성 같은 장시간 작업을 background로 돌리고
-- 프런트엔드가 job_id로 상태와 로그를 polling 한다.

CREATE TABLE IF NOT EXISTS jobs (
  id BIGSERIAL PRIMARY KEY,
  bid_id BIGINT NOT NULL,
  bid_ntce_no TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- 'pipeline' | 'proposals' | 'checklist' | 'price-advice'
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'success' | 'partial' | 'failed'
  logs TEXT NOT NULL DEFAULT '',
  result_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_bid_ntce_no ON jobs(bid_ntce_no, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at DESC);

ALTER TABLE jobs DISABLE ROW LEVEL SECURITY;
