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

// Per-job serialization queue. Parallelized pipeline branches in the same
// Lambda would otherwise race the read-modify-write of the `logs` field and
// overwrite each other. Chaining the writes through one promise per jobId
// within a single invocation is enough — cross-invocation races aren't a
// concern because only one worker writes to a given job at a time.
const jobLogQueue: Map<number, Promise<void>> = new Map();

export async function appendJobLog(jobId: number, line: string): Promise<void> {
  const prev = jobLogQueue.get(jobId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const sb = getSupabase();
      const { data } = await sb.from('jobs').select('logs').eq('id', jobId).maybeSingle();
      const curr = (data?.logs as string) || '';
      const updated = `${curr}[${ts()}] ${line}\n`;
      await sb.from('jobs').update({ logs: updated }).eq('id', jobId);
    });
  jobLogQueue.set(jobId, next);
  try {
    await next;
  } finally {
    // Drop the reference once it's the tail so the map doesn't leak.
    if (jobLogQueue.get(jobId) === next) jobLogQueue.delete(jobId);
  }
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

// Jobs that exceed this wall-clock budget without finishing are assumed to
// have been killed by the Vercel Lambda timeout (maxDuration=300s). Give a
// bit of slack above 300s so we don't race legitimate in-flight finishes.
const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Mark a single job as failed if it's been stuck in 'running' past ORPHAN_TIMEOUT_MS.
 * Called lazily from getJob so orphans self-resolve when the frontend polls them.
 */
async function maybeAutoFailOrphan(job: Job): Promise<Job> {
  if (job.status !== 'running') return job;
  const started = new Date(job.started_at || job.created_at).getTime();
  if (Number.isNaN(started)) return job;
  if (Date.now() - started < ORPHAN_TIMEOUT_MS) return job;

  const sb = getSupabase();
  const reason = `워커 타임아웃 (${Math.round((Date.now() - started) / 1000)}s 경과, 300초 Lambda 한도 초과로 추정)`;
  const next = `${job.logs || ''}[${ts()}] ⏱ ${reason}\n`;
  await sb
    .from('jobs')
    .update({
      status: 'failed',
      logs: next,
      error: reason,
      finished_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'running'); // guard against races with a worker that's actually finishing

  return { ...job, status: 'failed', error: reason, logs: next, finished_at: new Date().toISOString() };
}

export async function getJob(jobId: number): Promise<Job | undefined> {
  const sb = getSupabase();
  const { data } = await sb.from('jobs').select('*').eq('id', jobId).maybeSingle();
  if (!data) return undefined;
  return await maybeAutoFailOrphan(data as Job);
}

/**
 * Bulk cleanup — can be called from a cron to reap orphans that nobody polls.
 * Marks all jobs stuck in 'running' past the timeout as failed.
 */
export async function sweepOrphanJobs(): Promise<number> {
  const sb = getSupabase();
  const cutoff = new Date(Date.now() - ORPHAN_TIMEOUT_MS).toISOString();
  const { data } = await sb
    .from('jobs')
    .select('*')
    .eq('status', 'running')
    .lt('started_at', cutoff);
  const orphans = (data || []) as Job[];
  for (const j of orphans) {
    await maybeAutoFailOrphan(j);
  }
  return orphans.length;
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

// Fire the worker endpoint that actually runs the job. We can't rely on
// "continue after res.json()" on Vercel Lambda — the function gets frozen
// once the handler promise resolves. Instead the parent handler kicks off
// this self-fetch, waits briefly for the TCP handshake / request write,
// then aborts the client side. Vercel sees this as a separate invocation
// and keeps the worker alive for up to its own maxDuration (300s).
export async function dispatchJobWorker(
  jobId: number,
  opts: { host?: string; protocol?: string } = {}
): Promise<void> {
  const host = opts.host || process.env.VERCEL_URL || 'localhost:3000';
  const protocol = opts.protocol || (host.startsWith('localhost') ? 'http' : 'https');
  const url = `${protocol}://${host}/api/jobs/${jobId}/run`;

  const headers: Record<string, string> = {};
  if (process.env.WORKER_SECRET) {
    headers['x-worker-secret'] = process.env.WORKER_SECRET;
  }

  // Abort after 2.5s — long enough for the request to be sent and the
  // worker to begin processing, short enough to keep the parent snappy.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });
  } catch (e: any) {
    // AbortError is expected and means the worker is now running
    // independently. Any other error is genuinely a problem.
    if (e?.name !== 'AbortError') {
      console.error('dispatchJobWorker fetch failed:', e?.message || e);
      await appendJobLog(jobId, `⚠ worker dispatch error: ${e?.message || e}`).catch(() => {});
    }
  } finally {
    clearTimeout(timer);
  }
}
