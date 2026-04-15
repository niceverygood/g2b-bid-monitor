export interface Bid {
  id: number;
  bid_ntce_no: string;
  bid_ntce_nm: string;
  ntce_instt_nm: string;
  dminstt_nm: string;
  bid_ntce_dt: string;
  bid_clse_dt: string;
  presmpt_prce: number;
  cntrct_mthd_nm: string;
  bid_ntce_dtl_url: string;
  total_score: number;
  scores_json: string;
  recommendation: string;
  summary: string;
  key_points_json: string;
  risks_json: string;
  suggested_strategy: string;
  bookmarked: number;
  attachments?: AttachmentEntry[] | null;
  attachment_text?: AttachmentTextEntry[] | null;
  attachments_status?: string | null;
  attachments_error?: string | null;
  attachments_fetched_at?: string | null;
  attachments_parsed_at?: string | null;
}

export interface AttachmentEntry {
  sourceIdx: number;
  fileName: string;
  sourceUrl: string;
  status:
    | 'PENDING'
    | 'DOWNLOADED'
    | 'PARSED'
    | 'FAILED'
    | 'NEEDS_WORKER';
  storagePath?: string;
  mime?: string;
  fileSize?: number;
  error?: string;
  downloadedAt?: string;
  parsedAt?: string;
}

export interface AttachmentTextEntry {
  sourceIdx?: number;
  fileName: string;
  parser: string;
  charCount: number;
  warnings?: string[];
}

export interface AttachmentsSummary {
  bid_ntce_no: string;
  attachments: AttachmentEntry[];
  attachment_text: AttachmentTextEntry[];
  status: string | null;
  error: string | null;
  fetched_at: string | null;
  parsed_at: string | null;
}

export interface Stats {
  total: number;
  todayNew: number;
  strongFit: number;
  goodFit: number;
  avgScore: number;
  urgentCount: number;
}

export interface Proposal {
  doc_type: string;
  label: string;
  content?: string;
  created_at?: string;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  technical: '기술제안서',
  execution: '사업수행계획서',
  personnel: '투입인력 현황표',
  company: '회사소개서',
  track_record: '수행실적표',
  pricing: '가격제안서',
};

export interface ChecklistItem {
  category: string;
  item: string;
  required: boolean;
  description: string;
  status: 'pending' | 'done';
}

export interface PriceBreakdownItem {
  category: string;
  amount: number;
  note: string;
}

export interface PipelineResult {
  bid_ntce_no: string;
  bid_ntce_nm?: string;
  total_score?: number;
  recommendation?: string;
  bid_clse_dt?: string;
  status: string;
  checklist: {
    items: ChecklistItem[];
    deadline_summary: string;
    estimated_prep_days: number;
  } | null;
  price_advice: {
    estimated_price: number;
    recommended_bid_price: number;
    bid_rate: number;
    price_breakdown: PriceBreakdownItem[];
    strategy: string;
    risk_note: string;
  } | null;
  proposal_status: { docType: string; label: string; success: boolean; error?: string }[] | null;
  errors: string[];
  created_at?: string;
}

export interface Job {
  id: number;
  bid_id: number;
  bid_ntce_no: string;
  kind: 'pipeline' | 'proposals' | 'checklist' | 'price-advice';
  status: 'running' | 'success' | 'partial' | 'failed';
  logs: string;
  result_json?: unknown;
  error?: string | null;
  created_at: string;
  started_at: string;
  finished_at?: string | null;
}

export interface Filters {
  page: number;
  limit: number;
  sort: string;
  order: string;
  recommendation: string;
  keyword: string;
  bookmarked: boolean;
  status: string;
  withinDays?: number;
  minScore?: number;
}
