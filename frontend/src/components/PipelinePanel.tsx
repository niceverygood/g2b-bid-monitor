import { useState, useEffect, useCallback } from 'react';
import { PipelineResult, ChecklistItem, PriceBreakdownItem, Bid } from '../types';
import JobLogView from './JobLogView';

const API_BASE = '/api';

interface PipelinePanelProps {
  bidId: number;
  bidName: string;
  onClose: () => void;
  bid?: Bid;
}

type Tab = 'overview' | 'submit' | 'checklist' | 'price' | 'proposals' | 'logs';

export default function PipelinePanel({ bidId, bidName, onClose, bid }: PipelinePanelProps) {
  const [data, setData] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobId, setJobId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [checklistState, setChecklistState] = useState<ChecklistItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
    } catch {
      // Clipboard blocked — fall back to a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500);
    }
  }

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/bids/${bidId}/pipeline?include=jobs`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'NONE') {
          setData(null);
        } else {
          setData(json);
          setChecklistState(json.checklist?.items || []);
        }
        // Resume polling if a pipeline job is still running
        const running = (json.jobs || []).find(
          (j: { kind: string; status: string; id: number }) =>
            j.kind === 'pipeline' && j.status === 'running'
        );
        if (running) {
          setJobId(running.id);
          setTab('logs');
        }
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [bidId]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  async function startPipeline() {
    try {
      setStarting(true);
      const res = await fetch(`${API_BASE}/bids/${bidId}/pipeline`, { method: 'POST' });
      if (res.status === 202 || res.ok) {
        const json = await res.json();
        if (typeof json.job_id === 'number') {
          setJobId(json.job_id);
          setTab('logs');
        }
      }
    } catch {
      // ignore
    } finally {
      setStarting(false);
    }
  }

  const onJobDone = useCallback(async () => {
    // Re-fetch the persisted pipeline result so the tabs populate.
    await fetchPipeline();
  }, [fetchPipeline]);

  function toggleCheckItem(index: number) {
    setChecklistState(prev =>
      prev.map((item, i) =>
        i === index ? { ...item, status: item.status === 'done' ? 'pending' : 'done' } : item
      )
    );
  }

  function formatPrice(amount: number): string {
    if (amount >= 100000000) return `${(amount / 100000000).toFixed(1)}억원`;
    if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString()}만원`;
    return `${amount.toLocaleString()}원`;
  }

  const completedCount = checklistState.filter(i => i.status === 'done').length;
  const totalCount = checklistState.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-2xl">
          <div>
            <h2 className="text-lg font-bold">🚀 입찰 준비 파이프라인</h2>
            <p className="text-sm text-blue-100 mt-1 line-clamp-1">{bidName}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-2xl">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          {([
            ['overview', '📊 개요'],
            ['submit', '📮 제출키트'],
            ['checklist', '📋 체크리스트'],
            ['price', '💰 투찰가격'],
            ['proposals', '📝 제안서'],
            ['logs', jobId ? '📜 로그 •' : '📜 로그'],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-white'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : !data && !jobId && tab === 'submit' ? (
            <SubmitKit
              bid={bid}
              bidName={bidName}
              bidId={bidId}
              data={null}
              onCopy={copy}
              copiedKey={copiedKey}
              formatPrice={formatPrice}
            />
          ) : !data && !jobId ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🚀</div>
              <h3 className="text-xl font-bold text-gray-700 mb-2">입찰 준비를 시작하세요</h3>
              <p className="text-gray-500 mb-6">
                체크리스트 생성, 투찰가격 추천, 제안서 6종 자동 생성을<br />
                백그라운드로 실행합니다. 로그 탭에서 진행 상황을 확인할 수 있어요.
              </p>
              <button
                onClick={startPipeline}
                disabled={starting}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {starting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    작업 시작 중...
                  </span>
                ) : '🚀 입찰 준비 시작 (백그라운드)'}
              </button>
              <div className="mt-4 text-xs text-gray-400">
                또는 <button onClick={() => setTab('submit')} className="text-blue-600 hover:underline">📮 제출키트</button> 탭에서 기본 정보만 복사할 수 있습니다
              </div>
            </div>
          ) : !data && jobId ? (
            <div className="max-w-2xl mx-auto">
              <JobLogView jobId={jobId} onDone={onJobDone} title="파이프라인 실행 로그" />
            </div>
          ) : data && (
            <>
              {/* Overview Tab */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  {/* Status Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <StatusCard
                      icon="📋"
                      title="체크리스트"
                      value={data.checklist ? `${data.checklist.items.length}개 항목` : '미생성'}
                      sub={data.checklist ? `준비 예상: ${data.checklist.estimated_prep_days}일` : ''}
                      ok={!!data.checklist}
                    />
                    <StatusCard
                      icon="💰"
                      title="투찰가격"
                      value={data.price_advice ? formatPrice(data.price_advice.recommended_bid_price) : '미생성'}
                      sub={data.price_advice ? `투찰률: ${data.price_advice.bid_rate}%` : ''}
                      ok={!!data.price_advice}
                    />
                    <StatusCard
                      icon="📝"
                      title="제안서"
                      value={data.proposal_status ? `${data.proposal_status.filter(p => p.success).length}/6건` : '미생성'}
                      sub="기술/수행/인력/회사/실적/가격"
                      ok={!!data.proposal_status && data.proposal_status.every(p => p.success)}
                    />
                  </div>

                  {/* Progress */}
                  {totalCount > 0 && (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">체크리스트 진행률</span>
                        <span className="text-blue-600 font-bold">{progressPct}%</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{completedCount}/{totalCount} 완료</p>
                    </div>
                  )}

                  {/* Timeline */}
                  {data.checklist?.deadline_summary && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <h4 className="font-medium text-amber-800 mb-1">⏰ 일정 요약</h4>
                      <p className="text-sm text-amber-700">{data.checklist.deadline_summary}</p>
                    </div>
                  )}

                  {/* Errors */}
                  {data.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <h4 className="font-medium text-red-800 mb-2">⚠️ 오류</h4>
                      {data.errors.map((e, i) => (
                        <p key={i} className="text-sm text-red-600">• {e}</p>
                      ))}
                    </div>
                  )}

                  {/* Re-run button */}
                  <div className="text-center">
                    <button
                      onClick={startPipeline}
                      disabled={starting || !!jobId}
                      className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50"
                    >
                      {jobId ? '백그라운드 실행 중... (로그 탭 확인)' : starting ? '시작 중...' : '🔄 파이프라인 재실행'}
                    </button>
                  </div>
                </div>
              )}

              {/* Submit Kit Tab */}
              {tab === 'submit' && (
                <SubmitKit
                  bid={bid}
                  bidName={bidName}
                  bidId={bidId}
                  data={data}
                  onCopy={copy}
                  copiedKey={copiedKey}
                  formatPrice={formatPrice}
                />
              )}

              {/* Logs Tab */}
              {tab === 'logs' && (
                jobId ? (
                  <JobLogView jobId={jobId} onDone={onJobDone} title="파이프라인 실행 로그" />
                ) : (
                  <div className="text-center py-10 text-gray-400 text-sm">
                    실행 중인 작업이 없습니다. "파이프라인 재실행"을 눌러 시작하세요.
                  </div>
                )
              )}

              {/* Checklist Tab */}
              {tab === 'checklist' && data.checklist && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg">📋 입찰 참가 체크리스트</h3>
                    <span className="text-sm text-gray-500">{completedCount}/{totalCount} 완료</span>
                  </div>

                  {/* Group by category */}
                  {Array.from(new Set(checklistState.map(i => i.category))).map(cat => (
                    <div key={cat} className="bg-gray-50 rounded-xl p-4">
                      <h4 className="font-medium text-gray-700 mb-3 text-sm uppercase tracking-wider">{cat}</h4>
                      <div className="space-y-2">
                        {checklistState
                          .map((item, idx) => ({ item, idx }))
                          .filter(({ item }) => item.category === cat)
                          .map(({ item, idx }) => (
                            <label
                              key={idx}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                item.status === 'done' ? 'bg-green-50' : 'bg-white hover:bg-blue-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={item.status === 'done'}
                                onChange={() => toggleCheckItem(idx)}
                                className="mt-0.5 w-5 h-5 rounded border-gray-300 text-blue-600"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-gray-400' : ''}`}>
                                    {item.item}
                                  </span>
                                  {item.required && (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">필수</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                              </div>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Price Tab */}
              {tab === 'price' && data.price_advice && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-blue-600 font-medium">추정가격</p>
                      <p className="text-xl font-bold text-blue-800 mt-1">
                        {formatPrice(data.price_advice.estimated_price)}
                      </p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-green-600 font-medium">추천 투찰가</p>
                      <p className="text-xl font-bold text-green-800 mt-1">
                        {formatPrice(data.price_advice.recommended_bid_price)}
                      </p>
                    </div>
                    <div className="bg-purple-50 rounded-xl p-4 text-center">
                      <p className="text-xs text-purple-600 font-medium">투찰률</p>
                      <p className="text-xl font-bold text-purple-800 mt-1">
                        {data.price_advice.bid_rate}%
                      </p>
                    </div>
                  </div>

                  {/* Price Breakdown */}
                  <div className="bg-white border rounded-xl overflow-hidden">
                    <h4 className="font-bold text-sm p-4 bg-gray-50 border-b">💰 가격 산출 내역</h4>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-3 font-medium">항목</th>
                          <th className="text-right p-3 font-medium">금액</th>
                          <th className="text-left p-3 font-medium">비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.price_advice.price_breakdown.map((item: PriceBreakdownItem, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="p-3 font-medium">{item.category}</td>
                            <td className="p-3 text-right text-blue-600 font-mono">
                              {formatPrice(item.amount)}
                            </td>
                            <td className="p-3 text-gray-500 text-xs">{item.note}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300 bg-blue-50 font-bold">
                          <td className="p-3">합계</td>
                          <td className="p-3 text-right text-blue-700 font-mono">
                            {formatPrice(data.price_advice.price_breakdown.reduce((s: number, i: PriceBreakdownItem) => s + i.amount, 0))}
                          </td>
                          <td className="p-3"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Strategy */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h4 className="font-medium text-amber-800 mb-1">🎯 투찰 전략</h4>
                    <p className="text-sm text-amber-700">{data.price_advice.strategy}</p>
                  </div>

                  {data.price_advice.risk_note && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <h4 className="font-medium text-red-800 mb-1">⚠️ 리스크</h4>
                      <p className="text-sm text-red-700">{data.price_advice.risk_note}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Proposals Tab */}
              {tab === 'proposals' && data.proposal_status && (
                <div className="space-y-3">
                  <h3 className="font-bold text-lg mb-4">📝 제안서 생성 현황</h3>
                  {data.proposal_status.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-4 rounded-xl border ${
                        p.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{p.success ? '✅' : '❌'}</span>
                        <div>
                          <p className="font-medium text-sm">{p.label}</p>
                          <p className="text-xs text-gray-500">{p.docType}</p>
                        </div>
                      </div>
                      {p.success ? (
                        <span className="text-xs text-green-600 font-medium">생성 완료</span>
                      ) : (
                        <span className="text-xs text-red-600">{p.error || '생성 실패'}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Show empty state for tabs with no data */}
              {tab === 'checklist' && !data.checklist && (
                <p className="text-center text-gray-400 py-8">체크리스트 데이터가 없습니다</p>
              )}
              {tab === 'price' && !data.price_advice && (
                <p className="text-center text-gray-400 py-8">투찰가격 데이터가 없습니다</p>
              )}
              {tab === 'proposals' && !data.proposal_status && (
                <p className="text-center text-gray-400 py-8">제안서 데이터가 없습니다</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusCard({ icon, title, value, sub, ok }: {
  icon: string; title: string; value: string; sub: string; ok: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 border ${ok ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm font-medium text-gray-700">{title}</span>
        {ok && <span className="ml-auto text-green-500">✓</span>}
      </div>
      <p className="font-bold text-lg">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

/**
 * 제출 키트 — 사용자가 나라장터 입찰서 화면을 켰을 때
 * 클립보드에 필요한 값을 원클릭으로 꽂아넣기 위한 패널.
 * 모든 복사는 navigator.clipboard 기반 (PipelinePanel.copy).
 */
function SubmitKit({
  bid, bidName, bidId, data, onCopy, copiedKey, formatPrice,
}: {
  bid?: Bid;
  bidName: string;
  bidId: number;
  data: PipelineResult | null;
  onCopy: (text: string, key: string) => void;
  copiedKey: string | null;
  formatPrice: (amount: number) => string;
}) {
  const bidNtceNo = bid?.bid_ntce_no || data?.bid_ntce_no || '';
  const clseDt = bid?.bid_clse_dt || data?.bid_clse_dt || '';
  const cntrctMthd = bid?.cntrct_mthd_nm || '';
  const presmptPrce = bid?.presmpt_prce || 0;
  const dtlUrl = bid?.bid_ntce_dtl_url || '';
  const recommendedPrice = data?.price_advice?.recommended_bid_price || 0;
  const bidRate = data?.price_advice?.bid_rate || 0;

  const requiredChecklist = (data?.checklist?.items || []).filter(i => i.required);
  const successfulProposals = (data?.proposal_status || []).filter(p => p.success);

  // 전체 요약 — "📋 전체 복사" 버튼이 이걸 클립보드에 꽂음
  const summaryText = [
    `[${bidName}]`,
    `공고번호: ${bidNtceNo}`,
    `마감일시: ${(clseDt || '').slice(0, 16)}`,
    cntrctMthd && `계약방법: ${cntrctMthd}`,
    presmptPrce && `추정가격: ${presmptPrce.toLocaleString()}원`,
    recommendedPrice && `추천 투찰가: ${recommendedPrice.toLocaleString()}원 (${bidRate}%)`,
    '',
    '[준비 서류 체크]',
    ...requiredChecklist.map(i => `☐ ${i.item} — ${i.description || ''}`),
  ].filter(Boolean).join('\n');

  const CopyRow = ({ label, value, copyKey, mono = false }: {
    label: string; value: string; copyKey: string; mono?: boolean;
  }) => (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">{label}</span>
      <span className={`flex-1 text-sm text-gray-800 ${mono ? 'font-mono' : ''} truncate`} title={value}>
        {value || <span className="text-gray-300">—</span>}
      </span>
      <button
        onClick={() => value && onCopy(value, copyKey)}
        disabled={!value}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 ${
          copiedKey === copyKey
            ? 'bg-green-100 text-green-700'
            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-gray-50 disabled:text-gray-300'
        }`}
      >
        {copiedKey === copyKey ? '✓ 복사됨' : '📋 복사'}
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 안내 배너 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-bold text-blue-900 text-sm mb-1">📮 나라장터 입찰서 제출 도우미</h3>
        <p className="text-xs text-blue-700 leading-relaxed">
          아래 값들은 공인인증서 로그인 후 입찰서 작성 화면에 붙여넣기만 하면 됩니다.
          법적으로 최종 제출은 반드시 <b>본인</b>이 직접 클릭해야 합니다 (특별약관 제8조).
        </p>
      </div>

      {/* 핵심 값 복사 */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <h4 className="font-bold text-sm p-3 bg-gray-50 border-b flex items-center justify-between">
          <span>⚡ 빠른 복사</span>
          <button
            onClick={() => onCopy(summaryText, 'all')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              copiedKey === 'all' ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copiedKey === 'all' ? '✓ 복사됨' : '📋 전체 복사'}
          </button>
        </h4>
        <div className="px-4">
          <CopyRow label="공고번호" value={bidNtceNo} copyKey="no" mono />
          {recommendedPrice > 0 && (
            <CopyRow
              label="투찰가"
              value={recommendedPrice.toLocaleString()}
              copyKey="price"
              mono
            />
          )}
          {recommendedPrice > 0 && (
            <CopyRow
              label="투찰가(숫자)"
              value={String(recommendedPrice)}
              copyKey="price-raw"
              mono
            />
          )}
          <CopyRow label="공고명" value={bidName} copyKey="name" />
          <CopyRow label="마감일시" value={(clseDt || '').slice(0, 16)} copyKey="clse" mono />
          {cntrctMthd && <CopyRow label="계약방법" value={cntrctMthd} copyKey="mthd" />}
          {presmptPrce > 0 && (
            <CopyRow
              label="추정가격"
              value={presmptPrce.toLocaleString()}
              copyKey="est"
              mono
            />
          )}
        </div>
      </div>

      {/* 투찰가 하이라이트 카드 */}
      {recommendedPrice > 0 && (
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-5 text-white">
          <p className="text-xs text-green-100 uppercase tracking-wider font-medium mb-1">
            오늘 제출할 투찰 금액
          </p>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold font-mono">
              {recommendedPrice.toLocaleString()}
            </span>
            <span className="text-lg text-green-100">원</span>
            <span className="ml-auto text-sm bg-white/20 px-2 py-0.5 rounded">
              투찰률 {bidRate}%
            </span>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => onCopy(String(recommendedPrice), 'big-price')}
              className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {copiedKey === 'big-price' ? '✓ 복사됨' : '📋 금액만 복사'}
            </button>
            <button
              onClick={() => onCopy(formatPrice(recommendedPrice), 'big-price-label')}
              className="flex-1 bg-white/20 hover:bg-white/30 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {copiedKey === 'big-price-label' ? '✓ 복사됨' : `📋 ${formatPrice(recommendedPrice)} 복사`}
            </button>
          </div>
        </div>
      )}

      {/* 필수 제출 서류 체크 */}
      {requiredChecklist.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-bold text-sm mb-3 flex items-center justify-between">
            <span>📋 필수 제출 서류 ({requiredChecklist.length}개)</span>
          </h4>
          <ul className="space-y-1.5">
            {requiredChecklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                <span className="text-red-500 mt-0.5">•</span>
                <div className="flex-1">
                  <span className="font-medium">{item.item}</span>
                  {item.description && (
                    <span className="text-gray-500"> — {item.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI 제안서 다운로드 */}
      {successfulProposals.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-bold text-sm mb-3 flex items-center justify-between">
            <span>📝 AI 생성 제안서 ({successfulProposals.length}/6종)</span>
            <a
              href={`${API_BASE}/bids/${bidId}/proposals?format=zip`}
              className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-medium rounded hover:opacity-90"
            >
              📦 ZIP 전체 다운로드
            </a>
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {successfulProposals.map(p => (
              <a
                key={p.docType}
                href={`${API_BASE}/bids/${bidId}/proposals/${p.docType}?format=docx`}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-blue-50 rounded-lg text-xs text-gray-700 transition-colors"
              >
                <span>📄</span>
                <span className="flex-1 truncate">{p.label}</span>
                <span className="text-blue-600">.docx</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 나라장터 이동 */}
      {dtlUrl && (
        <a
          href={dtlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center px-6 py-4 bg-gradient-to-r from-[#F59E0B] to-[#EF4444] hover:from-[#D97706] hover:to-[#DC2626] text-white font-bold rounded-xl transition-all shadow-lg"
        >
          🚀 나라장터 입찰서 제출 페이지로 이동
          <div className="text-xs font-normal text-white/80 mt-1">
            공인인증서 로그인 후 본인이 직접 제출하세요
          </div>
        </a>
      )}

      {/* 파이프라인 미실행 시 안내 */}
      {!data?.price_advice && !data?.checklist && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          💡 투찰가·체크리스트·제안서를 자동으로 준비하려면 <b>개요 탭에서 "입찰 준비 시작"</b> 을 먼저 실행하세요.
        </div>
      )}
    </div>
  );
}
