import { useEffect, useRef, useState } from 'react';
import { Job } from '../types';

const API_BASE = '/api';

interface JobLogViewProps {
  jobId: number;
  // Called once the job reaches a terminal state (success/partial/failed)
  onDone?: (job: Job) => void;
  // Optional title shown above the log box
  title?: string;
  // Poll interval in ms (default 2000)
  intervalMs?: number;
  // Max height of the log box
  maxHeight?: number;
}

const STATUS_STYLES: Record<Job['status'], { label: string; className: string }> = {
  running: { label: '실행 중', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  success: { label: '완료', className: 'bg-green-100 text-green-700 border-green-200' },
  partial: { label: '일부 완료', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  failed: { label: '실패', className: 'bg-red-100 text-red-700 border-red-200' },
};

export default function JobLogView({
  jobId,
  onDone,
  title,
  intervalMs = 2000,
  maxHeight = 320,
}: JobLogViewProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logBoxRef = useRef<HTMLPreElement>(null);
  const autoScrollRef = useRef(true);
  const doneFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/jobs/${jobId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as Job;
        if (cancelled) return;
        setJob(j);
        setError(null);

        const terminal = j.status === 'success' || j.status === 'partial' || j.status === 'failed';
        if (terminal) {
          if (!doneFiredRef.current) {
            doneFiredRef.current = true;
            onDone?.(j);
          }
          return; // stop polling
        }
        timer = setTimeout(poll, intervalMs);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'Failed to fetch job');
        timer = setTimeout(poll, intervalMs * 2);
      }
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, intervalMs, onDone]);

  // Auto-scroll to bottom when logs grow, unless user scrolled up
  useEffect(() => {
    const el = logBoxRef.current;
    if (!el || !autoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [job?.logs]);

  const onScroll = () => {
    const el = logBoxRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  };

  const status = job?.status || 'running';
  const statusStyle = STATUS_STYLES[status];
  const elapsed = job?.started_at
    ? Math.round(
        ((job.finished_at ? new Date(job.finished_at).getTime() : Date.now()) -
          new Date(job.started_at).getTime()) /
          1000
      )
    : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {title && <span className="text-sm font-medium text-gray-700 truncate">{title}</span>}
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-full border ${statusStyle.className}`}
          >
            {status === 'running' ? (
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                {statusStyle.label}
              </span>
            ) : (
              statusStyle.label
            )}
          </span>
        </div>
        <span className="text-[11px] text-gray-400 whitespace-nowrap">
          #{jobId} · {elapsed}s
        </span>
      </div>

      <pre
        ref={logBoxRef}
        onScroll={onScroll}
        style={{ maxHeight }}
        className="bg-[#020617] text-[#CBD5E1] font-mono text-[11px] leading-5 p-3 rounded-lg overflow-auto whitespace-pre-wrap border border-[#1E293B]"
      >
        {job?.logs || (error ? `⚠ ${error}` : '대기 중...')}
      </pre>

      {job?.error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
          {job.error}
        </div>
      )}
    </div>
  );
}
