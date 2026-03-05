import type { AgentPhase } from "@/types/agentPhase";

const PROCEED_COMMANDS = new Set(["приступай", "начинай", "поехали", "start", "go ahead"]);
const DONE_COMMANDS = new Set(["готово", "done"]);

export function normalizeCommandText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isProceedCommand(text: string): boolean {
  return PROCEED_COMMANDS.has(normalizeCommandText(text));
}

export function isDoneCommand(text: string): boolean {
  return DONE_COMMANDS.has(normalizeCommandText(text));
}

export function hasTaskContext(userMessages: string[]): boolean {
  for (let i = userMessages.length - 1; i >= 0; i--) {
    const text = userMessages[i].trim();
    if (!text) continue;
    return !isProceedCommand(text);
  }
  return false;
}

export function resolvePhaseForUserMessage(params: {
  currentPhase: AgentPhase;
  userText: string;
  hasTaskContext: boolean;
}): AgentPhase {
  const { currentPhase, userText, hasTaskContext: contextExists } = params;
  if (currentPhase === "Done") {
    return "Planning";
  }
  if ((currentPhase === "Execution" || currentPhase === "Validation") && isDoneCommand(userText)) {
    return "Done";
  }
  if (isProceedCommand(userText) && contextExists) {
    return "Execution";
  }
  return "Planning";
}

export function transitionAfterExecution(): AgentPhase {
  return "Validation";
}

export function transitionAfterValidation(passed: boolean): AgentPhase {
  return passed ? "Done" : "Execution";
}
