import { getSupabase } from './supabase';

export type JobKind = 'pipeline' | 'proposals' | 'checklist' | 'price-advice';
export type JobStatus = 'running' | 'success' | 'partial' | 'failed';

export interface Job {
  id: number;
  bid_id: number;
  bid_ntce_no: string;
  kind: JobKind;
  status: JobStatus;
  logs: string;
  result_json?: unknown;
  error?: string | null;
  created_at: string;
  started_at: string;
  finished_at?: string | null;
}

function ts(): string {
  // KST-ish ISO-ish short timestamp (HH:MM:SS)
  const d = new Date();
  return d.toISOString().slice(11, 19);
}

export async function createJob(
  bidId: number,
  bidNtceNo: string,
  kind: JobKind,
  initialLog?: string
): Promise<number> {
  const sb = getSupabase();
  const firstLine = `[${ts()}] 🚀 ${kind} 작업 시작${initialLog ? ` — ${initialLog}` : ''}\n`;
  const { data, error } = await sb
    .from('jobs')
    .insert({
      bid_id: bidId,
      bid_ntce_no: bidNtceNo,
      kind,
      status: 'running',
      logs: firstLine,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('createJob error:', error?.message);
    throw new Error(`createJob failed: ${error?.message}`);
  }
  return data.id as number;
}

// Append a log line. Reads current logs, concatenates, updates.
// In serverless there's only one writer per job so no races in practice.
export async function appendJobLog(jobId: number, line: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from('jobs').select('logs').eq('id', jobId).maybeSingle();
  const prev = (data?.logs as string) || '';
  const next = `${prev}[${ts()}] ${line}\n`;
  await sb.from('jobs').update({ logs: next }).eq('id', jobId);
}

export async function finishJob(
  jobId: number,
  status: JobStatus,
  result?: unknown,
  finalLine?: string
): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from('jobs').select('logs').eq('id', jobId).maybeSingle();
  const prev = (data?.logs as string) || '';
  const tail = finalLine ? `${prev}[${ts()}] ${finalLine}\n` : prev;
  await sb
    .from('jobs')
    .update({
      status,
      logs: tail,
      result_json: result ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function failJob(jobId: number, error: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.from('jobs').select('logs').eq('id', jobId).maybeSingle();
  const prev = (data?.logs as string) || '';
  const next = `${prev}[${ts()}] ❌ ${error}\n`;
  await sb
    .from('jobs')
    .update({
      status: 'failed',
      logs: next,
      error,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId);
}

export async function getJob(jobId: number): Promise<Job | undefined> {
  const sb = getSupabase();
  const { data } = await sb.from('jobs').select('*').eq('id', jobId).maybeSingle();
  return (data as Job) || undefined;
}

export async function listJobsForBid(
  bidNtceNo: string,
  limit: number = 20
): Promise<Job[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from('jobs')
    .select('*')
    .eq('bid_ntce_no', bidNtceNo)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as Job[];
}

export async function listRecentJobs(limit: number = 50): Promise<Job[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []) as Job[];
}

// Helper to build an onLog callback that writes into a specific job row.
export function makeJobLogger(jobId: number): (line: string) => Promise<void> {
  return async (line: string) => {
    try {
      await appendJobLog(jobId, line);
    } catch (e: any) {
      console.error('appendJobLog failed:', e?.message);
    }
  };
}
