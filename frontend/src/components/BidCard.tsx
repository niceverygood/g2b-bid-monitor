import { useState } from 'react';
import { Bid } from '../types';
import ScoreGauge from './ScoreGauge';

interface BidCardProps {
  bid: Bid;
  onToggleBookmark: (id: number) => void;
}

const REC_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  STRONG_FIT: { label: '🔥 강력 추천', color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
  GOOD_FIT: { label: '✅ 추천', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  MODERATE_FIT: { label: '🟡 검토', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  WEAK_FIT: { label: '⚪ 약함', color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' },
  NOT_FIT: { label: '❌ 부적합', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  NOT_ANALYZED: { label: '⏳ 분석중', color: '#94A3B8', bg: 'rgba(148,163,184,0.15)' },
};

function getDDay(clseDt: string): { label: string; color: string; pulse: boolean } {
  if (!clseDt) return { label: '', color: '#94A3B8', pulse: false };
  const now = new Date();
  const close = new Date(clseDt.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5'));
  if (isNaN(close.getTime())) {
    const isoClose = new Date(clseDt);
    if (isNaN(isoClose.getTime())) return { label: '', color: '#94A3B8', pulse: false };
    const diff = Math.ceil((isoClose.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: '마감', color: '#64748B', pulse: false };
    if (diff <= 3) return { label: `D-${diff}`, color: '#EF4444', pulse: true };
    if (diff <= 7) return { label: `D-${diff}`, color: '#F59E0B', pulse: false };
    return { label: `D-${diff}`, color: '#3B82F6', pulse: false };
  }
  const diff = Math.ceil((close.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: '마감', color: '#64748B', pulse: false };
  if (diff <= 3) return { label: `D-${diff}`, color: '#EF4444', pulse: true };
  if (diff <= 7) return { label: `D-${diff}`, color: '#F59E0B', pulse: false };
  return { label: `D-${diff}`, color: '#3B82F6', pulse: false };
}

function formatPrice(price: number): string {
  if (!price) return '미정';
  if (price >= 100000000) return `${(price / 100000000).toFixed(1)}억원`;
  return `${Math.round(price / 10000).toLocaleString()}만원`;
}

function formatDate(dt: string): string {
  if (!dt) return '-';
  if (dt.length >= 12) {
    return `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)} ${dt.slice(8, 10)}:${dt.slice(10, 12)}`;
  }
  return dt;
}

export default function BidCard({ bid, onToggleBookmark }: BidCardProps) {
  const [expanded, setExpanded] = useState(false);

  const badge = REC_BADGE[bid.recommendation] || REC_BADGE.NOT_ANALYZED;
  const dday = getDDay(bid.bid_clse_dt);
  const scores = bid.scores_json ? JSON.parse(bid.scores_json) : {};
  const keyPoints: string[] = bid.key_points_json ? JSON.parse(bid.key_points_json) : [];
  const risks: string[] = bid.risks_json ? JSON.parse(bid.risks_json) : [];

  const scoreLabels = [
    { key: 'techFit', label: '기술' },
    { key: 'scaleFit', label: '규모' },
    { key: 'trackRecordFit', label: '실적' },
    { key: 'competitiveEdge', label: '경쟁력' },
    { key: 'winProbability', label: '수주' },
  ];

  return (
    <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 hover:border-[#334155] transition-colors animate-fadeIn">
      <div className="flex gap-4">
        {/* Score gauge */}
        <div className="hidden sm:block">
          <ScoreGauge score={bid.total_score} size={72} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-2">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ color: badge.color, backgroundColor: badge.bg }}
            >
              {badge.label}
            </span>
            {dday.label && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${dday.pulse ? 'animate-pulse' : ''}`}
                style={{ color: dday.color, backgroundColor: `${dday.color}20` }}
              >
                {dday.label}
              </span>
            )}
            {bid.cntrct_mthd_nm && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-[#1E293B] text-[#94A3B8]">
                {bid.cntrct_mthd_nm}
              </span>
            )}
            {/* Mobile score */}
            <span className="sm:hidden px-2 py-0.5 rounded-full text-xs font-bold"
              style={{
                color: bid.total_score >= 80 ? '#10B981' : bid.total_score >= 60 ? '#F59E0B' : '#EF4444',
                backgroundColor: bid.total_score >= 80 ? 'rgba(16,185,129,0.15)' : bid.total_score >= 60 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
              }}
            >
              {bid.total_score}점
            </span>
          </div>

          {/* Title */}
          <h3 className="text-[#F8FAFC] font-semibold text-sm leading-snug line-clamp-2 mb-2">
            {bid.bid_ntce_nm}
          </h3>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#94A3B8] mb-2">
            <span>🏛️ {bid.ntce_instt_nm || '-'}</span>
            <span>💰 {formatPrice(bid.presmpt_prce)}</span>
            <span>📅 {formatDate(bid.bid_clse_dt)}</span>
          </div>

          {/* AI Summary */}
          {bid.summary && (
            <p className="text-xs text-[#CBD5E1] mb-2">
              💡 {bid.summary}
            </p>
          )}

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
          >
            {expanded ? '▲ 접기' : '▼ 상세 분석 보기'}
          </button>

          {/* Expanded detail */}
          {expanded && (
            <div className="mt-3 space-y-3 animate-fadeIn">
              {/* Score details */}
              <div className="grid grid-cols-5 gap-2">
                {scoreLabels.map(s => (
                  <div key={s.key} className="text-center bg-[#1E293B] rounded-lg py-2">
                    <div className="text-sm font-bold" style={{
                      color: (scores[s.key] || 0) >= 80 ? '#10B981' : (scores[s.key] || 0) >= 60 ? '#F59E0B' : '#EF4444',
                    }}>
                      {scores[s.key] || 0}
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Key points & risks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-medium text-[#10B981] mb-1">✅ 강점</div>
                  <ul className="space-y-1">
                    {keyPoints.map((p, i) => (
                      <li key={i} className="text-xs text-[#CBD5E1] pl-2 border-l-2 border-[#10B981]">{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-medium text-[#F59E0B] mb-1">⚠️ 리스크</div>
                  <ul className="space-y-1">
                    {risks.map((r, i) => (
                      <li key={i} className="text-xs text-[#CBD5E1] pl-2 border-l-2 border-[#F59E0B]">{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Strategy */}
              {bid.suggested_strategy && (
                <div className="bg-[#1E3A5F] rounded-lg p-3">
                  <div className="text-xs font-medium text-[#3B82F6] mb-1">🎯 추천 전략</div>
                  <p className="text-xs text-[#CBD5E1]">{bid.suggested_strategy}</p>
                </div>
              )}

              {/* Bottom meta */}
              <div className="flex flex-wrap gap-x-4 text-[10px] text-[#64748B]">
                <span>📋 {bid.bid_ntce_no}</span>
                {bid.dminstt_nm && <span>🏢 {bid.dminstt_nm}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onToggleBookmark(bid.id)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              bid.bookmarked ? 'bg-[#F59E0B] text-[#020617]' : 'bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155]'
            }`}
            title={bid.bookmarked ? '북마크 해제' : '북마크'}
          >
            ⭐
          </button>
          {bid.bid_ntce_dtl_url && (
            <a
              href={bid.bid_ntce_dtl_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] transition-colors"
              title="나라장터 링크"
            >
              🔗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
