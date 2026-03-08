export const AGENT_PHASES = ["planning", "execution", "validation", "completed"] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

export const DEFAULT_AGENT_PHASE: AgentPhase = "planning";

const LEGACY_AGENT_PHASES: Record<string, AgentPhase> = {
  planning: "planning",
  Planning: "planning",
  execution: "execution",
  Execution: "execution",
  validation: "validation",
  Validation: "validation",
  completed: "completed",
  Completed: "completed",
  done: "completed",
  Done: "completed",
};

export const AGENT_PHASE_LABELS: Record<AgentPhase, string> = {
  planning: "Planning",
  execution: "Execution",
  validation: "Validation",
  completed: "Completed",
};

export function isAgentPhase(value: string): value is AgentPhase {
  return AGENT_PHASES.includes(value as AgentPhase);
}

export function coerceAgentPhase(value: string | null | undefined): AgentPhase {
  if (!value) return DEFAULT_AGENT_PHASE;
  if (isAgentPhase(value)) return value;
  return LEGACY_AGENT_PHASES[value] ?? DEFAULT_AGENT_PHASE;
}

export function formatAgentPhaseLabel(value: AgentPhase): string {
  return AGENT_PHASE_LABELS[value];
}
