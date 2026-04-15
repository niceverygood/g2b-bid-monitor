import { getSupabase } from './supabase';

export interface Bid {
  id?: number;
  bid_ntce_no: string;
  bid_ntce_ord?: string | null;
  bid_ntce_nm: string;
  ntce_instt_nm?: string | null;
  ntce_instt_cd?: string | null;
  dminstt_nm?: string | null;
  dminstt_cd?: string | null;
  bid_ntce_dt?: string | null;
  bid_clse_dt?: string | null;
  openg_dt?: string | null;
  presmpt_prce?: number | null;
  dtl_prgs_sttus_nm?: string | null;
  cntrct_mthd_nm?: string | null;
  bid_ntce_dtl_url?: string | null;
  ntce_kind_nm?: string | null;
  bid_mthd_nm?: string | null;
  srvc_div_nm?: string | null;
  total_score: number;
  scores_json?: any;
  recommendation: string;
  summary?: string | null;
  key_points_json?: any;
  risks_json?: any;
  suggested_strategy?: string | null;
  bookmarked: boolean;
  notified: boolean;
  collected_at?: string | null;
  analyzed_at?: string | null;
}

// ========== Bids ==========

export async function upsertBid(bid: Partial<Bid>): Promise<boolean> {
  const sb = getSupabase();

  const { data: existing } = await sb
    .from('bids')
    .select('id')
    .eq('bid_ntce_no', bid.bid_ntce_no!)
    .maybeSingle();

  if (existing) return false;

  const { error } = await sb.from('bids').insert({
    bid_ntce_no: bid.bid_ntce_no,
    bid_ntce_ord: bid.bid_ntce_ord || null,
    bid_ntce_nm: bid.bid_ntce_nm,
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

  if (error) {
    console.error('upsertBid error:', error.message);
    return false;
  }
  return true;
}

export async function getUnanalyzedBids(limit: number = 20): Promise<Bid[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('bids')
    .select('*')
    .is('analyzed_at', null)
    .eq('recommendation', 'NOT_ANALYZED')
    .order('collected_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getUnanalyzedBids error:', error.message);
    return [];
  }
  return (data || []) as Bid[];
}

export async function updateAnalysis(
  bidNtceNo: string,
  analysis: {
    total_score: number;
    scores_json: any;
    recommendation: string;
    summary: string;
    key_points_json: any;
    risks_json: any;
    suggested_strategy: string;
  }
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('bids')
    .update({
      ...analysis,
      analyzed_at: new Date().toISOString(),
    })
    .eq('bid_ntce_no', bidNtceNo);

  if (error) console.error('updateAnalysis error:', error.message);
}

export async function getBids(filters: {
  page?: number;
  limit?: number;
  sort?: string;
  order?: string;
  recommendation?: string;
  keyword?: string;
  minScore?: number;
  bookmarked?: boolean;
  status?: string;
  withinDays?: number;
}): Promise<{ data: Bid[]; total: number }> {
  const sb = getSupabase();
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
  const ascending = filters.order === 'asc';

  let query = sb.from('bids').select('*', { count: 'exact' });

  if (filters.recommendation) query = query.eq('recommendation', filters.recommendation);
  if (filters.keyword) query = query.or(
    `bid_ntce_nm.ilike.%${filters.keyword}%,ntce_instt_nm.ilike.%${filters.keyword}%,dminstt_nm.ilike.%${filters.keyword}%`
  );
  if (filters.minScore !== undefined) query = query.gte('total_score', filters.minScore);
  if (filters.bookmarked) query = query.eq('bookmarked', true);
  if (filters.status === 'active') query = query.gt('bid_clse_dt', new Date().toISOString());
  else if (filters.status === 'closed') query = query.lte('bid_clse_dt', new Date().toISOString());
  if (filters.withinDays !== undefined && filters.withinDays > 0) {
    const now = new Date();
    const horizon = new Date(Date.now() + filters.withinDays * 24 * 60 * 60 * 1000);
    query = query.gt('bid_clse_dt', now.toISOString()).lte('bid_clse_dt', horizon.toISOString());
  }

  query = query.order(sortCol, { ascending }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('getBids error:', error.message);
    return { data: [], total: 0 };
  }
  return { data: (data || []) as Bid[], total: count || 0 };
}

export async function getBidById(id: number): Promise<Bid | undefined> {
  const sb = getSupabase();
  const { data, error } = await sb.from('bids').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('getBidById error:', error.message);
    return undefined;
  }
  return (data as Bid) || undefined;
}

// Accept either the integer PK or the bid_ntce_no string (e.g. "R26BK01458752").
// All-digit strings are treated as the integer id; anything else is looked up by bid_ntce_no.
export async function resolveBid(key: string | number): Promise<Bid | undefined> {
  const raw = String(key).trim();
  if (/^\d+$/.test(raw)) return getBidById(parseInt(raw, 10));
  const sb = getSupabase();
  const { data, error } = await sb.from('bids').select('*').eq('bid_ntce_no', raw).maybeSingle();
  if (error) {
    console.error('resolveBid error:', error.message);
    return undefined;
  }
  return (data as Bid) || undefined;
}

export async function toggleBookmark(id: number): Promise<boolean> {
  const sb = getSupabase();
  const { data: current } = await sb.from('bids').select('bookmarked').eq('id', id).maybeSingle();
  if (!current) return false;

  const newValue = !current.bookmarked;
  const { error } = await sb.from('bids').update({ bookmarked: newValue }).eq('id', id);
  if (error) {
    console.error('toggleBookmark error:', error.message);
    return false;
  }
  return newValue;
}

export async function getUnnotifiedBids(minScore: number): Promise<Bid[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('bids')
    .select('*')
    .eq('notified', false)
    .gte('total_score', minScore)
    .order('total_score', { ascending: false });
  if (error) return [];
  return (data || []) as Bid[];
}

export async function markNotified(bidNtceNo: string): Promise<void> {
  const sb = getSupabase();
  await sb.from('bids').update({ notified: true }).eq('bid_ntce_no', bidNtceNo);
}

export async function getStats(): Promise<{
  total: number;
  todayNew: number;
  strongFit: number;
  goodFit: number;
  avgScore: number;
  urgentCount: number;
  recentCollectedAt: string | null;
}> {
  const sb = getSupabase();

  const [totalRes, todayRes, strongRes, goodRes, avgRes, urgentRes, recentRes] = await Promise.all([
    sb.from('bids').select('*', { count: 'exact', head: true }),
    sb.from('bids').select('*', { count: 'exact', head: true }).gte('collected_at', new Date().toISOString().slice(0, 10)),
    sb.from('bids').select('*', { count: 'exact', head: true }).eq('recommendation', 'STRONG_FIT'),
    sb.from('bids').select('*', { count: 'exact', head: true }).eq('recommendation', 'GOOD_FIT'),
    sb.from('bids').select('total_score').gt('total_score', 0),
    sb.from('bids').select('*', { count: 'exact', head: true })
      .gt('bid_clse_dt', new Date().toISOString())
      .lte('bid_clse_dt', new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()),
    sb.from('bids').select('collected_at').order('collected_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const scores = (avgRes.data || []) as { total_score: number }[];
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((s, r) => s + r.total_score, 0) / scores.length)
    : 0;

  return {
    total: totalRes.count || 0,
    todayNew: todayRes.count || 0,
    strongFit: strongRes.count || 0,
    goodFit: goodRes.count || 0,
    avgScore,
    urgentCount: urgentRes.count || 0,
    recentCollectedAt: (recentRes.data as any)?.collected_at || null,
  };
}

// ========== Logs ==========

export async function createLog(): Promise<number> {
  const sb = getSupabase();
  const { data, error } = await sb.from('collection_logs').insert({}).select('id').single();
  if (error || !data) return 0;
  return data.id;
}

export async function updateLog(id: number, fields: Record<string, unknown>): Promise<void> {
  const sb = getSupabase();
  await sb.from('collection_logs').update(fields).eq('id', id);
}

export async function getRecentLogs(limit: number = 20) {
  const sb = getSupabase();
  const { data } = await sb
    .from('collection_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function cleanOldBids(days: number): Promise<number> {
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await sb
    .from('bids')
    .delete({ count: 'exact' })
    .lt('collected_at', cutoff)
    .eq('bookmarked', false);
  if (error) return 0;
  return count || 0;
}

// ========== Proposals ==========

export async function saveProposal(bidNtceNo: string, docType: string, content: string): Promise<void> {
  const sb = getSupabase();
  const { data: bid } = await sb.from('bids').select('id').eq('bid_ntce_no', bidNtceNo).maybeSingle();
  const bidId = bid?.id || 0;

  await sb.from('proposals').upsert(
    { bid_id: bidId, bid_ntce_no: bidNtceNo, doc_type: docType, content },
    { onConflict: 'bid_ntce_no,doc_type' }
  );
}

export async function getProposals(bidNtceNo: string): Promise<{ doc_type: string; created_at: string }[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from('proposals')
    .select('doc_type, created_at')
    .eq('bid_ntce_no', bidNtceNo)
    .order('id');
  return (data || []) as { doc_type: string; created_at: string }[];
}

export async function getProposal(
  bidNtceNo: string,
  docType: string
): Promise<{ content: string; created_at: string } | undefined> {
  const sb = getSupabase();
  const { data } = await sb
    .from('proposals')
    .select('content, created_at')
    .eq('bid_ntce_no', bidNtceNo)
    .eq('doc_type', docType)
    .maybeSingle();
  return (data as any) || undefined;
}

// ========== Pipeline ==========

export async function savePipelineResult(
  bidNtceNo: string,
  data: {
    bid_id: number;
    checklist_json?: any;
    price_advice_json?: any;
    proposal_status_json?: any;
    errors_json?: any;
    status: string;
  }
): Promise<void> {
  const sb = getSupabase();
  await sb.from('pipeline_results').upsert(
    {
      bid_id: data.bid_id,
      bid_ntce_no: bidNtceNo,
      checklist_json: data.checklist_json || null,
      price_advice_json: data.price_advice_json || null,
      proposal_status_json: data.proposal_status_json || null,
      errors_json: data.errors_json || null,
      status: data.status,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'bid_ntce_no' }
  );
}

export async function getPipelineResult(bidNtceNo: string): Promise<any | undefined> {
  const sb = getSupabase();
  const { data } = await sb.from('pipeline_results').select('*').eq('bid_ntce_no', bidNtceNo).maybeSingle();
  return data || undefined;
}

export async function getAllPipelineResults(): Promise<any[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from('pipeline_results')
    .select('*, bids!inner(bid_ntce_nm, total_score, recommendation, bid_clse_dt)')
    .order('created_at', { ascending: false });
  return data || [];
}

export async function getBidsForPipeline(minScore: number): Promise<Bid[]> {
  const sb = getSupabase();

  // Get bids above threshold that don't have pipeline results yet
  const { data: doneList } = await sb.from('pipeline_results').select('bid_ntce_no');
  const doneSet = new Set((doneList || []).map((r: any) => r.bid_ntce_no));

  const { data } = await sb
    .from('bids')
    .select('*')
    .gte('total_score', minScore)
    .gt('bid_clse_dt', new Date().toISOString())
    .order('total_score', { ascending: false });

  return ((data || []) as Bid[]).filter(b => !doneSet.has(b.bid_ntce_no));
}

export async function getDeadlineAlertBids(withinDays: number): Promise<Bid[]> {
  const sb = getSupabase();
  const now = new Date().toISOString();
  const deadline = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await sb
    .from('bids')
    .select('*')
    .gte('total_score', 40)
    .gt('bid_clse_dt', now)
    .lte('bid_clse_dt', deadline)
    .order('bid_clse_dt', { ascending: true });

  return (data || []) as Bid[];
}
