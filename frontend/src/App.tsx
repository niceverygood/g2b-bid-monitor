import { useBids } from './hooks/useBids';
import FilterBar from './components/FilterBar';
import BidCard from './components/BidCard';

function SkeletonCard() {
  return (
    <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 animate-pulse">
      <div className="flex gap-4">
        <div className="hidden sm:block w-[72px] h-[72px] rounded-full bg-[#1E293B]" />
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-[#1E293B] rounded-full" />
            <div className="h-5 w-12 bg-[#1E293B] rounded-full" />
          </div>
          <div className="h-4 w-3/4 bg-[#1E293B] rounded" />
          <div className="h-3 w-1/2 bg-[#1E293B] rounded" />
          <div className="h-3 w-2/3 bg-[#1E293B] rounded" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const {
    bids, stats, loading, filters, total, collecting,
    updateFilters, toggleBookmark, triggerCollect,
  } = useBids();

  const statCards = [
    { icon: '📋', label: '전체 공고', value: stats.total, color: '#3B82F6', action: () => updateFilters({ recommendation: '', withinDays: undefined, minScore: undefined, status: 'all' }) },
    { icon: '🔥', label: '적합 공고', value: stats.strongFit + stats.goodFit, color: '#10B981', action: () => updateFilters({ recommendation: 'STRONG_FIT' }) },
    { icon: '📊', label: '평균 점수', value: `${stats.avgScore}점`, color: '#F59E0B' },
    { icon: '⏰', label: '마감 임박', value: stats.urgentCount, color: '#EF4444', action: () => updateFilters({ withinDays: 7, minScore: 60, status: 'active', sort: 'deadline', order: 'asc', recommendation: '' }) },
  ];

  return (
    <div className="min-h-screen bg-[#020617]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#020617]/90 backdrop-blur border-b border-[#1E293B]">
        <div className="max-w-[1024px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3B82F6] to-[#10B981] flex items-center justify-center text-white font-bold text-sm">
              B
            </div>
            <div>
              <h1 className="text-[#F8FAFC] font-bold text-sm leading-tight">바틀 입찰 모니터</h1>
              <p className="text-[#64748B] text-[10px]">나라장터 AI 적합도 분석</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={triggerCollect}
              disabled={collecting}
              className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              {collecting ? (
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : '🔄'}{' '}
              수집 실행
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1024px] mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map(s => {
            const clickable = 'action' in s && typeof s.action === 'function';
            const Comp: any = clickable ? 'button' : 'div';
            return (
              <Comp
                key={s.label}
                onClick={clickable ? s.action : undefined}
                className={`bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 text-left transition-colors ${clickable ? 'hover:border-[#334155] hover:bg-[#131d33] cursor-pointer' : ''}`}
              >
                <div className="text-lg mb-1">{s.icon}</div>
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-[#94A3B8]">{s.label}</div>
              </Comp>
            );
          })}
        </div>

        {/* Filter */}
        <FilterBar filters={filters} total={total} onUpdate={updateFilters} />

        {/* Bid list */}
        <div className="space-y-3">
          {loading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : bids.length === 0 ? (
            <div className="text-center py-16 text-[#94A3B8]">
              <div className="text-4xl mb-3">🔍</div>
              <p>조건에 맞는 공고가 없습니다</p>
            </div>
          ) : (
            bids.map(bid => (
              <BidCard key={bid.id} bid={bid} onToggleBookmark={toggleBookmark} />
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && bids.length > 0 && (
          <div className="flex justify-center gap-2">
            <button
              onClick={() => updateFilters({ page: filters.page - 1 })}
              disabled={filters.page <= 1}
              className="px-3 py-1.5 bg-[#1E293B] text-[#CBD5E1] rounded-lg text-sm disabled:opacity-30 hover:bg-[#334155] transition-colors"
            >
              ← 이전
            </button>
            <span className="px-3 py-1.5 text-sm text-[#94A3B8]">
              {filters.page} / {Math.ceil(total / filters.limit) || 1}
            </span>
            <button
              onClick={() => updateFilters({ page: filters.page + 1 })}
              disabled={filters.page >= Math.ceil(total / filters.limit)}
              className="px-3 py-1.5 bg-[#1E293B] text-[#CBD5E1] rounded-lg text-sm disabled:opacity-30 hover:bg-[#334155] transition-colors"
            >
              다음 →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
