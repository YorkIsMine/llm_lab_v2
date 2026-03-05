"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { MemoryInspectorPanel } from "@/components/MemoryInspectorPanel";
import { DEFAULT_AGENT_PHASE, type AgentPhase } from "@/types/agentPhase";

interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface MessagesResponse {
  phase: AgentPhase;
  messages: Message[];
}

const PHASE_BADGE_STYLES: Record<AgentPhase, string> = {
  Planning: "text-[rgb(var(--cyber-muted))] border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.06)]",
  Execution: "text-[rgb(var(--cyber-cyan))] border-[rgba(0,245,255,0.35)] bg-[rgba(0,245,255,0.08)]",
  Validation: "text-[rgb(var(--cyber-magenta))] border-[rgba(255,0,255,0.35)] bg-[rgba(255,0,255,0.08)]",
  Done: "text-[#8bff7f] border-[rgba(139,255,127,0.35)] bg-[rgba(139,255,127,0.08)]",
};

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [lastUsage, setLastUsage] = useState<TokenUsage | null>(null);
  const [totalSessionTokens, setTotalSessionTokens] = useState(0);
  const [phase, setPhase] = useState<AgentPhase>(DEFAULT_AGENT_PHASE);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMemoryOpen(searchParams.get("memory") === "1");
  }, [searchParams]);

  const openMemory = () => {
    setMemoryOpen(true);
    router.replace(`/chat/${id}?memory=1`, { scroll: false });
  };
  const closeMemory = () => {
    setMemoryOpen(false);
    router.replace(`/chat/${id}`, { scroll: false });
  };

  const fetchMessages = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/sessions/${id}/messages`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMessages(data as Message[]);
          setPhase(DEFAULT_AGENT_PHASE);
        } else {
          const typed = data as MessagesResponse;
          setMessages(Array.isArray(typed.messages) ? typed.messages : []);
          setPhase(typed.phase ?? DEFAULT_AGENT_PHASE);
        }
      } else if (res.status === 404) {
        router.replace("/");
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    setLastUsage(null);
    setTotalSessionTokens(0);
    setPhase(DEFAULT_AGENT_PHASE);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: Message = {
      id: "u-" + Date.now(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const loadingId = "loading-" + Date.now();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: loadingId, role: "assistant", content: "", createdAt: "" },
    ]);
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Ошибка отправки");
        setMessages((prev) => prev.filter((m) => m.id !== loadingId));
        setInput(text);
        return;
      }
      const assistant = await res.json();
      if (assistant.usage) {
        setLastUsage(assistant.usage);
        setTotalSessionTokens((t) => t + assistant.usage.totalTokens);
      }
      if (assistant.phase) {
        setPhase(assistant.phase as AgentPhase);
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingId
            ? {
                id: assistant.messageId,
                role: assistant.role,
                content: assistant.content,
                createdAt: assistant.createdAt,
              }
            : m
        )
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== loadingId));
      setInput(text);
      alert("Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 min-h-0">
        <span className="text-[rgb(var(--cyber-muted))] text-xs uppercase tracking-widest">Загрузка…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 flex justify-center">
        <div className="w-full max-w-xl flex flex-col flex-1 min-h-0">
          <header className="flex items-center justify-between shrink-0 py-3 px-4 border-b border-[rgba(0,245,255,0.2)]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[rgb(var(--cyber-muted))] uppercase tracking-[0.2em]">Чат</span>
              <span
                className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border rounded-sm ${PHASE_BADGE_STYLES[phase]}`}
              >
                {phase}
              </span>
            </div>
            <button
              type="button"
              onClick={openMemory}
              className="text-xs text-[rgb(var(--cyber-cyan))] hover:text-[rgb(var(--cyber-cyan))] transition-smooth flex items-center gap-2 border border-[rgba(0,245,255,0.4)] px-3 py-1.5 rounded-sm hover:bg-[rgba(0,245,255,0.08)] hover:shadow-[0_0_12px_-2px_rgba(0,245,255,0.3)]"
            >
              <span className="w-4 h-4 rounded-sm border border-current flex items-center justify-center text-[10px] font-bold">M</span>
              Memory
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <p className="text-[rgb(var(--cyber-muted))] text-xs py-4 uppercase tracking-wider">Напишите сообщение, чтобы начать.</p>
            )}
            {messages.map((m) => {
              const isLoading = m.role === "assistant" && !m.content;
              return (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "flex justify-end"
                      : "flex justify-start"
                  }
                >
                  <div
                    className={
                      m.role === "user"
                        ? "bg-[rgba(0,245,255,0.08)] text-[rgb(var(--cyber-text))] rounded-sm rounded-br-none px-4 py-3 max-w-[88%] border border-[rgba(0,245,255,0.35)] shadow-[0_0_15px_-4px_rgba(0,245,255,0.2)]"
                        : "bg-[rgba(18,20,32,0.8)] text-[rgb(var(--cyber-text))] rounded-sm rounded-bl-none px-4 py-3 max-w-[88%] border border-[rgba(255,0,255,0.25)]"
                    }
                  >
                    <div className="text-[10px] text-[rgb(var(--cyber-muted))] mb-1.5 uppercase tracking-widest">
                      {m.role === "user" ? "Вы" : "Ассистент"}
                    </div>
                    {isLoading ? (
                      <div className="flex items-center gap-1.5 py-0.5">
                        <span className="inline-block w-2 h-2 rounded-sm bg-[rgb(var(--cyber-cyan))] animate-bounce opacity-80" style={{ animationDelay: "0ms" }} />
                        <span className="inline-block w-2 h-2 rounded-sm bg-[rgb(var(--cyber-cyan))] animate-bounce opacity-80" style={{ animationDelay: "150ms" }} />
                        <span className="inline-block w-2 h-2 rounded-sm bg-[rgb(var(--cyber-cyan))] animate-bounce opacity-80" style={{ animationDelay: "300ms" }} />
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words text-xs leading-relaxed">{m.content}</div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <form
            className="shrink-0 p-4 border-t border-[rgba(0,245,255,0.2)]"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Сообщение…"
                className="flex-1 rounded-sm bg-[rgba(18,20,32,0.9)] border border-[rgba(0,245,255,0.3)] px-4 py-2.5 text-[rgb(var(--cyber-text))] placeholder-[rgb(var(--cyber-muted))] text-sm focus:outline-none focus:border-[rgb(var(--cyber-cyan))] focus:shadow-[0_0_12px_-2px_rgba(0,245,255,0.25)] transition-smooth"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-sm bg-transparent border-2 border-[rgb(var(--cyber-cyan))] text-[rgb(var(--cyber-cyan))] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-smooth hover:bg-[rgba(0,245,255,0.1)] hover:shadow-[0_0_18px_-4px_rgba(0,245,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none"
              >
                {sending ? "…" : "Отправить"}
              </button>
            </div>
            {(lastUsage || totalSessionTokens > 0) && (
              <div className="mt-2 flex items-center gap-4 text-[10px] text-[rgb(var(--cyber-muted))] uppercase tracking-wider">
                {lastUsage && (
                  <span>
                    Токены: <span className="text-[rgb(var(--cyber-cyan))]">{lastUsage.promptTokens}</span> prompt + <span className="text-[rgb(var(--cyber-magenta))]">{lastUsage.completionTokens}</span> reply = {lastUsage.totalTokens}
                  </span>
                )}
                {totalSessionTokens > 0 && (
                  <span>Всего за сессию: <span className="text-[rgb(var(--cyber-cyan))]">{totalSessionTokens}</span></span>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {memoryOpen && (
        <MemoryInspectorPanel sessionId={id} onClose={closeMemory} />
      )}
    </div>
  );
}
