import { useState, useEffect, useCallback } from 'react';
import { DOC_TYPE_LABELS } from '../types';

const API_BASE = '/api';
const DOC_TYPES = Object.keys(DOC_TYPE_LABELS);

interface ProposalPanelProps {
  bidId: number;
  onClose: () => void;
}

export default function ProposalPanel({ bidId, onClose }: ProposalPanelProps) {
  const [activeTab, setActiveTab] = useState(DOC_TYPES[0]);
  const [generated, setGenerated] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [generatingAll, setGeneratingAll] = useState(false);
  const [existingDocs, setExistingDocs] = useState<string[]>([]);

  const fetchExisting = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/bids/${bidId}/proposals`);
      const json = await res.json();
      const docs = (json.proposals || []).map((p: { doc_type: string }) => p.doc_type);
      setExistingDocs(docs);
    } catch {}
  }, [bidId]);

  useEffect(() => {
    fetchExisting();
  }, [fetchExisting]);

  const fetchDoc = useCallback(async (docType: string) => {
    if (generated[docType]) return;
    try {
      const res = await fetch(`${API_BASE}/bids/${bidId}/proposals/${docType}`);
      if (res.ok) {
        const json = await res.json();
        setGenerated(prev => ({ ...prev, [docType]: json.content }));
      }
    } catch {}
  }, [bidId, generated]);

  useEffect(() => {
    if (existingDocs.includes(activeTab)) {
      fetchDoc(activeTab);
    }
  }, [activeTab, existingDocs, fetchDoc]);

  const generateOne = async (docType: string) => {
    setLoading(prev => ({ ...prev, [docType]: true }));
    try {
      const res = await fetch(`${API_BASE}/bids/${bidId}/proposals/generate/${docType}`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setGenerated(prev => ({ ...prev, [docType]: json.content }));
        setExistingDocs(prev => prev.includes(docType) ? prev : [...prev, docType]);
      }
    } catch {} finally {
      setLoading(prev => ({ ...prev, [docType]: false }));
    }
  };

  const generateAll = async () => {
    setGeneratingAll(true);
    try {
      await fetch(`${API_BASE}/bids/${bidId}/proposals/generate`, { method: 'POST' });
      // Poll for completion
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const res = await fetch(`${API_BASE}/bids/${bidId}/proposals`);
        const json = await res.json();
        const docs = (json.proposals || []).map((p: { doc_type: string }) => p.doc_type);
        setExistingDocs(docs);
        if (docs.length >= DOC_TYPES.length) break;
      }
      // Fetch the active tab
      await fetchDoc(activeTab);
    } catch {} finally {
      setGeneratingAll(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadMd = (docType: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${DOC_TYPE_LABELS[docType]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const content = generated[activeTab];
  const isLoading = loading[activeTab];
  const hasDoc = existingDocs.includes(activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1E293B]">
          <h2 className="text-[#F8FAFC] font-bold text-base">📄 입찰 제안서 생성</h2>
          <div className="flex gap-2">
            <button
              onClick={generateAll}
              disabled={generatingAll}
              className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
            >
              {generatingAll ? (
                <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : '🚀'}{' '}
              전체 생성
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-[#1E293B] text-[#94A3B8] hover:bg-[#334155] flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 py-3 border-b border-[#1E293B] overflow-x-auto">
          {DOC_TYPES.map(dt => (
            <button
              key={dt}
              onClick={() => setActiveTab(dt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1 ${
                activeTab === dt
                  ? 'bg-[#3B82F6] text-white'
                  : 'bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155]'
              }`}
            >
              {existingDocs.includes(dt) && <span className="text-[#10B981]">●</span>}
              {DOC_TYPE_LABELS[dt]}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading || (generatingAll && !content) ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
              <span className="inline-block w-8 h-8 border-3 border-[#334155] border-t-[#3B82F6] rounded-full animate-spin mb-4" />
              <p className="text-sm">{DOC_TYPE_LABELS[activeTab]} 생성 중...</p>
              <p className="text-xs mt-1">AI가 문서를 작성하고 있습니다 (30초~1분)</p>
            </div>
          ) : content ? (
            <div>
              {/* Action bar */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => copyToClipboard(content)}
                  className="px-3 py-1.5 bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155] rounded-lg text-xs transition-colors"
                >
                  📋 복사
                </button>
                <button
                  onClick={() => downloadMd(activeTab, content)}
                  className="px-3 py-1.5 bg-[#1E293B] text-[#CBD5E1] hover:bg-[#334155] rounded-lg text-xs transition-colors"
                >
                  💾 .md 다운로드
                </button>
                <button
                  onClick={() => generateOne(activeTab)}
                  className="px-3 py-1.5 bg-[#1E293B] text-[#F59E0B] hover:bg-[#334155] rounded-lg text-xs transition-colors"
                >
                  🔄 재생성
                </button>
              </div>
              {/* Markdown preview */}
              <div className="prose prose-invert prose-sm max-w-none bg-[#020617] border border-[#1E293B] rounded-xl p-5 text-[#CBD5E1] leading-relaxed whitespace-pre-wrap font-mono text-xs">
                {content}
              </div>
            </div>
          ) : hasDoc ? (
            <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
              <p className="text-sm">문서 로딩 중...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-[#94A3B8]">
              <div className="text-4xl mb-3">📝</div>
              <p className="text-sm mb-3">{DOC_TYPE_LABELS[activeTab]}가 아직 생성되지 않았습니다</p>
              <button
                onClick={() => generateOne(activeTab)}
                className="px-4 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-sm font-medium rounded-lg transition-colors"
              >
                이 문서만 생성
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
