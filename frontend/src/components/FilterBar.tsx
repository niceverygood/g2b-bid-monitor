import { Filters } from '../types';

interface FilterBarProps {
  filters: Filters;
  total: number;
  onUpdate: (partial: Partial<Filters>) => void;
}

const RECOMMENDATION_FILTERS = [
  { label: '전체', value: '' },
  { label: '🔥 강력', value: 'STRONG_FIT' },
  { label: '✅ 추천', value: 'GOOD_FIT' },
  { label: '🟡 검토', value: 'MODERATE_FIT' },
];

const SORT_OPTIONS = [
  { label: '적합도순', value: 'totalScore' },
  { label: '최신순', value: 'latest' },
  { label: '마감임박순', value: 'deadline' },
  { label: '금액순', value: 'price' },
];

export default function FilterBar({ filters, total, onUpdate }: FilterBarProps) {
  return (
    <div className="bg-[#0F172A] border border-[#1E293B] rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {RECOMMENDATION_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => onUpdate({ recommendation: f.value })}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filters.recommendation === f.value
                ? 'bg-[#3B82F6] text-white'
                : 'bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">🔍</span>
          <input
            type="text"
            placeholder="공고명 / 기관명 검색"
            value={filters.keyword}
            onChange={e => onUpdate({ keyword: e.target.value })}
            className="w-full bg-[#1E293B] border border-[#334155] rounded-lg pl-9 pr-3 py-2 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#3B82F6]"
          />
        </div>

        <select
          value={filters.sort}
          onChange={e => onUpdate({ sort: e.target.value })}
          className="bg-[#1E293B] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#CBD5E1] focus:outline-none focus:border-[#3B82F6]"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => onUpdate({ bookmarked: !filters.bookmarked })}
          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
            filters.bookmarked
              ? 'bg-[#F59E0B] text-[#020617]'
              : 'bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155]'
          }`}
        >
          ⭐ 북마크
        </button>
      </div>

      <div className="text-xs text-[#94A3B8]">
        검색 결과 {total}건
      </div>
    </div>
  );
}
