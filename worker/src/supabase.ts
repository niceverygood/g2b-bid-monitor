import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export interface WorkerBid {
  id: number;
  bid_ntce_no: string;
  bid_ntce_nm: string;
  total_score: number;
  attachments: AttachmentEntry[] | null;
  attachment_text: any;
  attachments_status: string | null;
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

/**
 * 워커가 처리해야 할 공고를 가져온다.
 *
 * 조건:
 *   - total_score >= MIN_SCORE
 *   - attachments_status IN (DOWNLOADED, PARSED)  — 파싱 단계까지 내려온 것만
 *   - 애플리케이션 단에서 attachments 배열을 확인해 NEEDS_WORKER 엔트리 필터
 *
 * (PostgREST 의 .contains() JSONB 조건은 배열+오브젝트 조합을 제대로 인코딩하지
 *  못하고 "invalid input syntax for type json" 에러가 나는 경우가 있어, 애플리
 *  케이션 단 필터로 대체한다.)
 */
export async function claimWorkerJobs(
  minScore: number,
  limit: number = 5
): Promise<WorkerBid[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('bids')
    .select(
      'id, bid_ntce_no, bid_ntce_nm, total_score, attachments, attachment_text, attachments_status, bid_clse_dt'
    )
    .gte('total_score', minScore)
    .in('attachments_status', ['DOWNLOADED', 'PARSED'])
    .order('total_score', { ascending: false })
    .limit(100);
  if (error) {
    console.error('claimWorkerJobs error:', error.message);
    return [];
  }
  const nowMs = Date.now();
  const filtered: WorkerBid[] = [];
  for (const row of (data || []) as any[]) {
    const atts = Array.isArray(row.attachments) ? row.attachments : [];
    const hasNeedsWorker = atts.some((a: any) => a?.status === 'NEEDS_WORKER');
    if (!hasNeedsWorker) continue;
    // bid_clse_dt 가 과거면 스킵 (문자열 'YYYY-MM-DD HH:MM:SS' → Date)
    if (row.bid_clse_dt) {
      const close = new Date(String(row.bid_clse_dt).replace(' ', 'T'));
      if (!isNaN(close.getTime()) && close.getTime() < nowMs) continue;
    }
    filtered.push(row as WorkerBid);
    if (filtered.length >= limit) break;
  }
  return filtered;
}

export async function updateBidAttachments(
  bidNtceNo: string,
  fields: {
    attachments?: any;
    attachment_text?: any;
    attachments_status?: string;
    attachments_error?: string | null;
    attachments_parsed_at?: string;
  }
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('bids')
    .update(fields)
    .eq('bid_ntce_no', bidNtceNo);
  if (error) console.error('updateBidAttachments error:', error.message);
}

export async function downloadFromStorage(
  storagePath: string
): Promise<Buffer> {
  const sb = getSupabase();
  const { data, error } = await sb.storage
    .from('bid-attachments')
    .download(storagePath);
  if (error || !data) {
    throw new Error(`storage download: ${error?.message ?? 'no data'}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadToStorage(
  storagePath: string,
  buffer: Buffer,
  mime: string
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.storage
    .from('bid-attachments')
    .upload(storagePath, buffer, { contentType: mime, upsert: true });
  if (error) throw new Error(`storage upload: ${error.message}`);
}
