export const AGENT_PHASES = ["Planning", "Execution", "Validation", "Done"] as const;

export type AgentPhase = (typeof AGENT_PHASES)[number];

export const DEFAULT_AGENT_PHASE: AgentPhase = "Planning";

export function isAgentPhase(value: string): value is AgentPhase {
  return AGENT_PHASES.includes(value as AgentPhase);
}

export function coerceAgentPhase(value: string | null | undefined): AgentPhase {
  if (value && isAgentPhase(value)) return value;
  return DEFAULT_AGENT_PHASE;
}
