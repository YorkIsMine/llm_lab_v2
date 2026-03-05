"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface InvariantItem {
  id: string;
  title: string;
  rule: string;
  status: "active" | "archived";
  updatedAt: string;
}

interface InvariantPanelProps {
  onClose: () => void;
}

export function InvariantPanel({ onClose }: InvariantPanelProps) {
  const [items, setItems] = useState<InvariantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState("");
  const [rule, setRule] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRule, setEditRule] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/invariants?status=all");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось загрузить инварианты");
      }
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setEnabled(data.enabled !== false);
    } catch (e) {
      setError((e as Error).message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const visibleItems = useMemo(
    () => items.filter((item) => (showArchived ? true : item.status === "active")),
    [items, showArchived]
  );

  const createItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rule.trim() || saving) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/invariants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined, rule: rule.trim(), status: "active" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось создать инвариант");
      }
      const created = (await res.json()) as InvariantItem;
      setItems((prev) => [created, ...prev]);
      setTitle("");
      setRule("");
    } catch (e) {
      setError((e as Error).message || "Ошибка создания");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (id: string) => {
    if (!editRule.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invariants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rule: editRule.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось обновить инвариант");
      }
      const updated = (await res.json()) as InvariantItem;
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setEditRule("");
    } catch (e) {
      setError((e as Error).message || "Ошибка обновления");
    } finally {
      setSaving(false);
    }
  };

  const archiveItem = async (id: string) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invariants/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось архивировать инвариант");
      }
      const body = await res.json();
      const updated = body.item as InvariantItem;
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError((e as Error).message || "Ошибка архивации");
    } finally {
      setSaving(false);
    }
  };

  const restoreItem = async (id: string) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/invariants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось восстановить инвариант");
      }
      const updated = (await res.json()) as InvariantItem;
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (e) {
      setError((e as Error).message || "Ошибка восстановления");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/invariants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Не удалось переключить применение инвариантов");
      }
      setEnabled(next);
    } catch (e) {
      setError((e as Error).message || "Ошибка переключения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-[rgb(var(--cyber-bg))]/80 backdrop-blur-sm z-40" aria-hidden onClick={onClose} />
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-lg bg-[rgb(var(--cyber-panel))] border-l-2 border-[rgba(0,245,255,0.35)] shadow-[-0_0_40px_-10px_rgba(0,245,255,0.25)] z-50 flex flex-col panel-slide-in"
        role="dialog"
        aria-label="Инварианты ассистента"
      >
        <header className="flex items-center justify-between shrink-0 py-3 px-4 border-b border-[rgba(0,245,255,0.25)]">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-[rgb(var(--cyber-cyan))]">Инварианты ассистента</h2>
            <p className="text-[10px] text-[rgb(var(--cyber-muted))] uppercase tracking-wider mt-1">Инварианты — правила, которые ассистент не нарушает.</p>
          </div>
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

        <div className="shrink-0 p-4 border-b border-[rgba(0,245,255,0.15)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-[rgb(var(--cyber-muted))]">Применение</span>
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={saving}
              className={`px-3 py-1.5 text-xs uppercase tracking-wider rounded-sm border transition-smooth ${
                enabled
                  ? "text-[rgb(var(--cyber-cyan))] border-[rgba(0,245,255,0.45)] bg-[rgba(0,245,255,0.08)]"
                  : "text-[rgb(var(--cyber-magenta))] border-[rgba(255,0,255,0.45)] bg-[rgba(255,0,255,0.08)]"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </button>
          </div>

          <form onSubmit={createItem} className="space-y-2">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              type="text"
              placeholder="Короткое имя (опционально)"
              className="w-full rounded-sm bg-[rgba(18,20,32,0.9)] border border-[rgba(0,245,255,0.25)] px-3 py-2 text-xs text-[rgb(var(--cyber-text))] placeholder-[rgb(var(--cyber-muted))]"
            />
            <textarea
              value={rule}
              onChange={(event) => setRule(event.target.value)}
              placeholder="Пример: Нельзя показывать PII в ответах"
              rows={3}
              className="w-full rounded-sm bg-[rgba(18,20,32,0.9)] border border-[rgba(0,245,255,0.25)] px-3 py-2 text-xs text-[rgb(var(--cyber-text))] placeholder-[rgb(var(--cyber-muted))] resize-none"
            />
            <button
              type="submit"
              disabled={saving || !rule.trim()}
              className="w-full rounded-sm bg-transparent border border-[rgba(0,245,255,0.45)] text-[rgb(var(--cyber-cyan))] px-3 py-2 text-xs font-semibold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Добавить инвариант
            </button>
          </form>

          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[rgb(var(--cyber-muted))]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="accent-cyan-400"
            />
            Показать архив
          </label>

          {error && <p className="text-xs text-[rgb(var(--cyber-magenta))]">{error}</p>}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-xs text-[rgb(var(--cyber-muted))] uppercase tracking-wider">Загрузка…</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-xs text-[rgb(var(--cyber-muted))]">Инварианты не заданы.</p>
          ) : (
            visibleItems.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <article
                  key={item.id}
                  className="border border-[rgba(0,245,255,0.25)] rounded-sm p-3 bg-[rgba(0,0,0,0.2)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-[rgb(var(--cyber-muted))] truncate">{item.id}</p>
                      <h3 className="text-xs text-[rgb(var(--cyber-cyan))] font-semibold truncate">{item.title}</h3>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border ${
                        item.status === "active"
                          ? "text-[rgb(var(--cyber-cyan))] border-[rgba(0,245,255,0.35)]"
                          : "text-[rgb(var(--cyber-muted))] border-[rgba(255,255,255,0.2)]"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        value={editRule}
                        onChange={(event) => setEditRule(event.target.value)}
                        rows={3}
                        className="w-full rounded-sm bg-[rgba(18,20,32,0.9)] border border-[rgba(0,245,255,0.25)] px-3 py-2 text-xs text-[rgb(var(--cyber-text))] resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(item.id)}
                          disabled={saving || !editRule.trim()}
                          className="flex-1 rounded-sm border border-[rgba(0,245,255,0.4)] text-[rgb(var(--cyber-cyan))] px-2 py-1.5 text-xs uppercase tracking-wider disabled:opacity-50"
                        >
                          Сохранить
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setEditRule("");
                          }}
                          className="flex-1 rounded-sm border border-[rgba(255,255,255,0.2)] text-[rgb(var(--cyber-muted))] px-2 py-1.5 text-xs uppercase tracking-wider"
                        >
                          Отмена
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[rgb(var(--cyber-text))] whitespace-pre-wrap">{item.rule}</p>
                  )}

                  {!isEditing && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(item.id);
                          setEditRule(item.rule);
                        }}
                        className="flex-1 rounded-sm border border-[rgba(0,245,255,0.35)] text-[rgb(var(--cyber-cyan))] px-2 py-1.5 text-xs uppercase tracking-wider"
                      >
                        Редактировать
                      </button>
                      {item.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => archiveItem(item.id)}
                          className="flex-1 rounded-sm border border-[rgba(255,0,255,0.35)] text-[rgb(var(--cyber-magenta))] px-2 py-1.5 text-xs uppercase tracking-wider"
                        >
                          Архивировать
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => restoreItem(item.id)}
                          className="flex-1 rounded-sm border border-[rgba(0,245,255,0.35)] text-[rgb(var(--cyber-cyan))] px-2 py-1.5 text-xs uppercase tracking-wider"
                        >
                          Восстановить
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
