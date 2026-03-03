"use client";

import { useEffect, useState, useCallback } from "react";

interface ShortMemory {
  type: "short";
  messages: { role: string; content: string; createdAt: string }[];
  description: string;
}

interface WorkingMemoryView {
  type: "working";
  contentText: string;
  contentJson: string;
  updatedAt: string;
}

interface LongTermItem {
  id: string;
  scope: string;
  key: string;
  contentText: string;
  contentJson: string;
  tags: string;
  updatedAt: string;
}

interface MemoryView {
  short: ShortMemory;
  working: WorkingMemoryView | null;
  longTerm: LongTermItem[];
}

export function MemoryInspectorPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<MemoryView | null>(null);
  const [globalLongTerm, setGlobalLongTerm] = useState<LongTermItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"short" | "working" | "long">("short");
  const [clearing, setClearing] = useState(false);

  const fetchMemory = useCallback(async () => {
    try {
      const [sessionRes, globalRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/memory`),
        fetch("/api/memory/long-term"),
      ]);
      if (sessionRes.ok) setData(await sessionRes.json());
      if (globalRes.ok) {
        const j = await globalRes.json();
        setGlobalLongTerm(j.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchMemory();
  }, [fetchMemory]);

  const clearLongTerm = async () => {
    setClearing(true);
    try {
      const res = await fetch("/api/memory/long-term?scope=user", { method: "DELETE" });
      if (res.ok) await fetchMemory();
    } finally {
      setClearing(false);
    }
  };

  const tabs = [
    { key: "short" as const, label: "Short" },
    { key: "working" as const, label: "Working" },
    { key: "long" as const, label: "Long-term" },
  ];

  return (
    <>
      <div
        className="fixed inset-0 bg-[rgb(var(--cyber-bg))]/80 backdrop-blur-sm z-40 transition-smooth"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[rgb(var(--cyber-panel))] border-l-2 border-[rgba(255,0,255,0.4)] shadow-[-0_0_40px_-10px_rgba(255,0,255,0.2)] z-50 flex flex-col panel-slide-in"
        role="dialog"
        aria-label="Memory Inspector"
      >
        <header className="flex items-center justify-between shrink-0 py-3 px-4 border-b border-[rgba(0,245,255,0.25)]">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[rgb(var(--cyber-cyan))]">Memory Inspector</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-sm text-[rgb(var(--cyber-muted))] hover:text-[rgb(var(--cyber-magenta))] hover:bg-[rgba(255,0,255,0.1)] border border-transparent hover:border-[rgba(255,0,255,0.3)] transition-smooth"
            aria-label="Закрыть"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex gap-2 p-3 border-b border-[rgba(0,245,255,0.15)] shrink-0">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 px-3 py-2 rounded-sm text-xs font-semibold uppercase tracking-wider transition-smooth ${
                activeTab === t.key
                  ? "bg-[rgba(0,245,255,0.2)] text-[rgb(var(--cyber-cyan))] border border-[rgba(0,245,255,0.5)]"
                  : "text-[rgb(var(--cyber-muted))] hover:text-[rgb(var(--cyber-text))] hover:bg-[rgba(0,245,255,0.06)] border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {loading ? (
            <p className="text-[rgb(var(--cyber-muted))] text-xs uppercase tracking-wider">Загрузка…</p>
          ) : !data ? (
            <p className="text-[rgb(var(--cyber-muted))] text-xs">Нет данных</p>
          ) : activeTab === "short" ? (
            <section>
              <p className="text-[10px] text-[rgb(var(--cyber-muted))] mb-3 uppercase tracking-wider">{data.short.description}</p>
              <ul className="space-y-2">
                {data.short.messages.length === 0 ? (
                  <li className="text-[rgb(var(--cyber-muted))] text-xs">Нет сообщений в окне.</li>
                ) : (
                  data.short.messages.map((m, i) => (
                    <li key={i} className="border-l-2 border-[rgb(var(--cyber-cyan))] pl-3 py-1.5">
                      <span className="text-[10px] text-[rgb(var(--cyber-muted))] uppercase tracking-wider">{m.role}</span>
                      <p className="text-xs text-[rgb(var(--cyber-text))] whitespace-pre-wrap mt-0.5 line-clamp-3">{m.content}</p>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : activeTab === "working" ? (
            <section className="space-y-3">
              {data.working ? (
                <>
                  <div>
                    <p className="text-[10px] text-[rgb(var(--cyber-muted))] mb-1 uppercase">Текст</p>
                    <pre className="text-xs text-[rgb(var(--cyber-text))] whitespace-pre-wrap font-sans rounded-sm bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,255,0.2)] p-3 max-h-32 overflow-y-auto">
                      {data.working.contentText || "(пусто)"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-[10px] text-[rgb(var(--cyber-muted))] mb-1 uppercase">JSON</p>
                    <pre className="text-xs text-[rgb(var(--cyber-muted))] overflow-x-auto bg-[rgba(0,0,0,0.3)] border border-[rgba(0,245,255,0.2)] p-3 rounded-sm max-h-24 overflow-y-auto">
                      {data.working.contentJson}
                    </pre>
                  </div>
                </>
              ) : (
                <p className="text-[rgb(var(--cyber-muted))] text-xs">Нет рабочей памяти.</p>
              )}
            </section>
          ) : (
            <section className="space-y-2">
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  onClick={clearLongTerm}
                  disabled={clearing || ((data.longTerm?.length ?? 0) === 0 && globalLongTerm.length === 0)}
                  className="text-xs text-[rgb(var(--cyber-magenta))] hover:underline disabled:opacity-50 disabled:cursor-not-allowed transition-smooth uppercase tracking-wider"
                >
                  {clearing ? "…" : "Очистить long-term"}
                </button>
              </div>
              {[...(data.longTerm || []), ...globalLongTerm]
                .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
                .map((item) => (
                  <div
                    key={item.id}
                    className="border border-[rgba(0,245,255,0.25)] rounded-sm p-3 text-xs bg-[rgba(0,0,0,0.2)]"
                  >
                    <div className="flex justify-between text-[rgb(var(--cyber-muted))] mb-1 text-[10px] uppercase tracking-wider">
                      <span>{item.scope} / {item.key}</span>
                    </div>
                    <p className="text-[rgb(var(--cyber-text))] line-clamp-2">{item.contentText}</p>
                  </div>
                ))}
              {data.longTerm?.length === 0 && globalLongTerm.length === 0 && (
                <p className="text-[rgb(var(--cyber-muted))] text-xs">Нет записей.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}
