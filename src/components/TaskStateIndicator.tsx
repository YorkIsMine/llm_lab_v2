"use client";

import React from "react";
import { AGENT_PHASES, formatAgentPhaseLabel, type AgentPhase } from "@/types/agentPhase";

const BADGE_STYLES: Record<AgentPhase, string> = {
  planning: "text-[rgb(var(--cyber-muted))] border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.06)]",
  execution: "text-[rgb(var(--cyber-cyan))] border-[rgba(0,245,255,0.35)] bg-[rgba(0,245,255,0.08)]",
  validation: "text-[rgb(var(--cyber-magenta))] border-[rgba(255,0,255,0.35)] bg-[rgba(255,0,255,0.08)]",
  completed: "text-[#8bff7f] border-[rgba(139,255,127,0.35)] bg-[rgba(139,255,127,0.08)]",
};

export function TaskStateIndicator({ currentState }: { currentState: AgentPhase }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[rgb(var(--cyber-muted))] uppercase tracking-[0.2em]">Task</span>
        <span
          className={`text-[10px] uppercase tracking-[0.2em] px-2 py-1 border rounded-sm ${BADGE_STYLES[currentState]}`}
          data-task-state={currentState}
        >
          {currentState}
        </span>
      </div>
      <ol className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-[rgb(var(--cyber-muted))]">
        {AGENT_PHASES.map((state, index) => {
          const isActive = state === currentState;
          const isReached = AGENT_PHASES.indexOf(currentState) >= index;
          return (
            <li key={state} className="flex items-center gap-2">
              <span
                className={`px-2 py-1 border rounded-sm transition-smooth ${
                  isActive
                    ? BADGE_STYLES[state]
                    : isReached
                      ? "text-[rgb(var(--cyber-text))] border-[rgba(0,245,255,0.25)] bg-[rgba(255,255,255,0.03)]"
                      : "border-[rgba(255,255,255,0.12)] bg-transparent"
                }`}
              >
                {formatAgentPhaseLabel(state)}
              </span>
              {index < AGENT_PHASES.length - 1 && (
                <span className="w-5 h-px bg-[rgba(255,255,255,0.14)]" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
