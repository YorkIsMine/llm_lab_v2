"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { AgentPhase } from "@/types/agentPhase";

interface Session {
  id: string;
  title: string;
  phase: AgentPhase;
  createdAt: string;
  updatedAt: string;
}

export function ChatSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const createSession = async () => {
    if (creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data?.error ?? "Не удалось создать чат");
        return;
      }
      const session = data as Session;
      if (!session?.id) {
        setCreateError("Неверный ответ сервера");
        return;
      }
      setSessions((prev) => [session, ...prev]);
      router.push(`/chat/${session.id}`);
    } catch {
      setCreateError("Ошибка сети или сервера");
    } finally {
      setCreating(false);
    }
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (pathname === `/chat/${id}` || pathname.startsWith(`/chat/${id}/`)) {
        router.replace("/");
      }
    }
  };

  const currentChatId = pathname.startsWith("/chat/") ? pathname.split("/")[2] : null;

  return (
    <aside className="w-[400px] min-w-[400px] shrink-0 flex flex-col border-r border-[rgba(0,245,255,0.25)] bg-[rgb(var(--cyber-panel))]/95 backdrop-blur-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(0,245,255,0.5)] to-transparent" />
      <div className="p-5 border-b border-[rgba(0,245,255,0.2)]">
        <h1 className="text-xl font-bold tracking-widest uppercase text-[rgb(var(--cyber-cyan))] drop-shadow-[0_0_8px_rgba(0,245,255,0.5)]">
          LLM Lab
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-[rgb(var(--cyber-muted))] mt-1">Neural Interface</p>
      </div>
      <div className="mx-4 mt-5">
        <button
          type="button"
          onClick={createSession}
          disabled={creating}
          className="w-full py-3.5 rounded-sm bg-transparent border-2 border-[rgb(var(--cyber-cyan))] text-[rgb(var(--cyber-cyan))] text-sm font-semibold uppercase tracking-wider transition-smooth hover:bg-[rgba(0,245,255,0.1)] hover:shadow-[0_0_20px_-4px_rgba(0,245,255,0.4)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--cyber-cyan))] focus:ring-offset-2 focus:ring-offset-[rgb(var(--cyber-panel))] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {creating ? "Создание…" : "+ Новый чат"}
        </button>
        {createError && (
          <p className="mt-2 text-xs text-[rgb(var(--cyber-magenta))] px-1" role="alert">
            {createError}
          </p>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto p-3 mt-4">
        {loading && sessions.length === 0 ? (
          <p className="text-[rgb(var(--cyber-muted))] text-xs px-3 py-2 uppercase tracking-wider">Загрузка…</p>
        ) : sessions.length === 0 ? (
          <p className="text-[rgb(var(--cyber-muted))] text-xs px-3 py-2 uppercase tracking-wider">Нет чатов</p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => {
              const isActive = currentChatId === s.id;
              return (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className={`flex items-center justify-between gap-2 py-3 px-4 rounded-sm group transition-smooth border-l-2 ${
                      isActive
                        ? "bg-[rgba(0,245,255,0.12)] border-[rgb(var(--cyber-cyan))] text-[rgb(var(--cyber-text))] shadow-[inset_0_0_20px_-10px_rgba(0,245,255,0.3)]"
                        : "border-transparent text-[rgb(var(--cyber-muted))] hover:bg-[rgba(0,245,255,0.06)] hover:border-[rgba(0,245,255,0.3)] hover:text-[rgb(var(--cyber-text))]"
                    }`}
                  >
                    <span className="truncate flex-1 text-sm font-medium">{s.title}</span>
                    <button
                      type="button"
                      onClick={(e) => deleteSession(e, s.id)}
                      className="opacity-0 group-hover:opacity-100 text-[rgb(var(--cyber-muted))] hover:text-[rgb(var(--cyber-magenta))] text-sm p-1.5 rounded transition-smooth hover:bg-[rgba(255,0,255,0.1)]"
                      aria-label="Удалить"
                    >
                      ×
                    </button>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,0,255,0.3)] to-transparent" />
    </aside>
  );
}
