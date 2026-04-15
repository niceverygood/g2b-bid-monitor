-- 입찰 첨부파일(공고문/규격서/제안요청서 등) 메타 + 추출 텍스트
--
-- 전략:
--   1) g2b REST (selectUntyAtchFileList.do) 로 파일 목록(JSON) 수집 → attachments
--   2) Playwright 워커가 AES 암호화 다운로드 → Supabase Storage 업로드
--   3) 파서 레이어(pdf/hwpx/hwp/xlsx/docx)로 텍스트 추출 → attachment_text
--   4) analyzer / proposal-generator 프롬프트에 텍스트 주입 (재채점 X)
--
-- 단일 패스 채점 유지: metadata 기반 total_score >= 70 인 공고만 첨부파일 파이프라인 진입

ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS unty_atch_file_no TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB,
  -- attachments 형태:
  -- [{
  --   "atchFileSqno": 1,
  --   "fileName": "제안요청서.hwp",
  --   "fileSize": 123456,
  --   "atchFileKndCd": "첨020297",
  --   "storagePath": "bids/R268K01458754/제안요청서.hwp",  -- Supabase Storage key
  --   "mime": "application/x-hwp",
  --   "downloadedAt": "2026-04-15T..."
  -- }, ...]
  ADD COLUMN IF NOT EXISTS attachment_text JSONB,
  -- attachment_text 형태:
  -- [{
  --   "atchFileSqno": 1,
  --   "fileName": "제안요청서.hwp",
  --   "parser": "hwp5txt" | "hwpx-xml" | "pdfjs" | "xlsx" | "mammoth",
  --   "charCount": 18234,
  --   "text": "..."
  -- }, ...]
  ADD COLUMN IF NOT EXISTS attachments_status TEXT DEFAULT 'PENDING',
  -- PENDING | SKIPPED (score<70) | FETCHING | PARSED | FAILED
  ADD COLUMN IF NOT EXISTS attachments_error TEXT,
  ADD COLUMN IF NOT EXISTS attachments_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attachments_parsed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bids_att_status ON bids(attachments_status);
CREATE INDEX IF NOT EXISTS idx_bids_unty_atch ON bids(unty_atch_file_no);

-- Storage 버킷 생성 (공고 첨부파일 원본 보관)
-- 비공개 버킷 — 서비스 롤 키로만 접근
INSERT INTO storage.buckets (id, name, public)
VALUES ('bid-attachments', 'bid-attachments', false)
ON CONFLICT (id) DO NOTHING;
