import { useCallback, useEffect, useState } from 'react';
import type { AttachmentsSummary, AttachmentEntry } from '../types';

interface Props {
  bidId: number;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기',
  DOWNLOADED: '다운로드 완료',
  PARSED: '파싱 완료',
  FAILED: '실패',
  NEEDS_WORKER: '워커 대기',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-slate-700 text-slate-300',
  DOWNLOADED: 'bg-blue-900/50 text-blue-300',
  PARSED: 'bg-emerald-900/50 text-emerald-300',
  FAILED: 'bg-red-900/50 text-red-300',
  NEEDS_WORKER: 'bg-amber-900/50 text-amber-300',
};

/**
 * 공고별 첨부파일 상태 + 다운로드/파싱 트리거 패널
 *
 * - 최초 렌더: GET /api/bids/:id/attachments 로 현재 상태 조회
 * - "다운로드 + 파싱" 버튼: POST /api/bids/:id/attachments 로 실행 (동기, 최대 60s)
 */
export function AttachmentsPanel({ bidId }: Props) {
  const [data, setData] = useState<AttachmentsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/bids/${bidId}/attachments`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as AttachmentsSummary;
      setData(json);
      setErr(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => {
    load();
  }, [load]);

  const trigger = async () => {
    try {
      setRunning(true);
      setErr(null);
      const res = await fetch(`/api/bids/${bidId}/attachments`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="text-xs text-[#64748B] py-2">📎 첨부파일 로딩 중…</div>
    );
  }

  const entries: AttachmentEntry[] = data?.attachments ?? [];
  const textEntries = data?.attachment_text ?? [];
  const textByIdx = new Map(textEntries.map((t) => [t.sourceIdx, t]));

  const hasAny = entries.length > 0;
  const needsRun =
    !data?.status ||
    data.status === 'PENDING' ||
    entries.some((e) => e.status === 'PENDING' || e.status === 'NEEDS_WORKER');

  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#E2E8F0]">📎 공고 첨부파일</span>
          {data?.status && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded ${
                STATUS_COLOR[data.status] ?? 'bg-slate-700 text-slate-300'
              }`}
            >
              {STATUS_LABEL[data.status] ?? data.status}
            </span>
          )}
          {hasAny && (
            <span className="text-[10px] text-[#64748B]">{entries.length}건</span>
          )}
        </div>
        <button
          onClick={trigger}
          disabled={running || !hasAny}
          className="text-[10px] px-2.5 py-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded disabled:bg-[#334155] disabled:text-[#64748B] disabled:cursor-not-allowed transition-colors"
        >
          {running ? '⏳ 처리 중…' : needsRun ? '다운로드 + 파싱' : '재실행'}
        </button>
      </div>

      {err && (
        <div className="text-[10px] text-red-300 mb-2 bg-red-900/30 p-2 rounded border border-red-900/50">
          ⚠️ {err}
        </div>
      )}

      {!hasAny ? (
        <div className="text-[10px] text-[#64748B]">
          공공데이터 OpenAPI 응답에 첨부파일 링크가 없습니다.
        </div>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => {
            const txt = textByIdx.get(e.sourceIdx);
            return (
              <li
                key={e.sourceIdx}
                className="text-[11px] flex items-start gap-2 bg-[#0F172A] px-2 py-1.5 rounded border border-[#334155]"
              >
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] ${
                    STATUS_COLOR[e.status] ?? 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {STATUS_LABEL[e.status] ?? e.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[#E2E8F0] truncate" title={e.fileName}>
                    {e.fileName}
                  </div>
                  <div className="text-[#64748B] text-[9px]">
                    {e.fileSize ? formatSize(e.fileSize) : '-'}
                    {txt && (
                      <>
                        {' · '}
                        {txt.parser} · {txt.charCount.toLocaleString()}자
                      </>
                    )}
                    {e.error && <span className="text-red-400"> · {e.error}</span>}
                  </div>
                </div>
                {e.sourceUrl && (
                  <a
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[#3B82F6] hover:underline text-[9px]"
                  >
                    원본
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data?.parsed_at && (
        <div className="text-[9px] text-[#64748B] mt-2">
          마지막 파싱: {new Date(data.parsed_at).toLocaleString('ko-KR')}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
