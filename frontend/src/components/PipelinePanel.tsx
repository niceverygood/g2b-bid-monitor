import { useState, useEffect, useCallback } from 'react';
import { PipelineResult, ChecklistItem, PriceBreakdownItem } from '../types';
import JobLogView from './JobLogView';

const API_BASE = '/api';

interface PipelinePanelProps {
  bidId: number;
  bidName: string;
  onClose: () => void;
}

type Tab = 'overview' | 'checklist' | 'price' | 'proposals' | 'logs';

export default function PipelinePanel({ bidId, bidName, onClose }: PipelinePanelProps) {
  const [data, setData] = useState<PipelineResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [jobId, setJobId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [checklistState, setChecklistState] = useState<ChecklistItem[]>([]);

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
