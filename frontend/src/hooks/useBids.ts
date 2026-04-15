import { useState, useEffect, useCallback } from 'react';
import { Bid, Stats, Filters } from '../types';

const API_BASE = '/api';

export function useBids() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, todayNew: 0, strongFit: 0, goodFit: 0, avgScore: 0, urgentCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    page: 1,
    limit: 20,
    sort: 'totalScore',
    order: 'desc',
    recommendation: '',
    keyword: '',
    bookmarked: false,
    status: 'all',
  });

  const fetchBids = useCallback(async (f: Filters) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(f.page));
      params.set('limit', String(f.limit));
      params.set('sort', f.sort);
      params.set('order', f.order);
      if (f.recommendation) params.set('recommendation', f.recommendation);
      if (f.keyword) params.set('keyword', f.keyword);
      if (f.bookmarked) params.set('bookmarked', 'true');
      if (f.status !== 'all') params.set('status', f.status);
      if (f.withinDays !== undefined) params.set('withinDays', String(f.withinDays));
      if (f.minScore !== undefined) params.set('minScore', String(f.minScore));

      const res = await fetch(`${API_BASE}/bids?${params}`);
      const json = await res.json();
      setBids(json.data || []);
      setTotalPages(json.pagination?.totalPages || 0);
      setTotal(json.pagination?.total || 0);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      const json = await res.json();
      setStats(json);
    } catch {}
  }, []);

  const toggleBookmark = useCallback(async (id: number) => {
    try {
      await fetch(`${API_BASE}/bids/${id}/bookmark`, { method: 'POST' });
      setBids(prev => prev.map(b => b.id === id ? { ...b, bookmarked: b.bookmarked ? 0 : 1 } : b));
    } catch {}
  }, []);

  const triggerCollect = useCallback(async () => {
    try {
      setCollecting(true);
      await fetch(`${API_BASE}/collect`, { method: 'POST' });
      setTimeout(() => {
        fetchBids(filters);
        fetchStats();
        setCollecting(false);
      }, 3000);
    } catch {
      setCollecting(false);
    }
  }, [filters, fetchBids, fetchStats]);

  const updateFilters = useCallback((partial: Partial<Filters>) => {
    setFilters(prev => {
      const next = { ...prev, ...partial };
      if (
        partial.recommendation !== undefined ||
        partial.keyword !== undefined ||
        partial.bookmarked !== undefined ||
        partial.sort !== undefined ||
        partial.status !== undefined ||
        partial.withinDays !== undefined ||
        partial.minScore !== undefined
      ) {
        next.page = 1;
      }
      return next;
    });
  }, []);

  useEffect(() => {
    fetchBids(filters);
  }, [filters, fetchBids]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => {
      fetchBids(filters);
      fetchStats();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchBids, filters]);

  return {
    bids, stats, loading, error, filters, totalPages, total, collecting,
    updateFilters, toggleBookmark, triggerCollect, fetchBids: () => fetchBids(filters),
  };
}
