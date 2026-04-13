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
}

export interface Stats {
  total: number;
  todayNew: number;
  strongFit: number;
  goodFit: number;
  avgScore: number;
  urgentCount: number;
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
}
