import { prisma } from "@/lib/db";
import {
  createChatCompletion,
  createMemoryUpdateCompletion,
  createValidationCompletion,
  shouldSaveFactsToLongTerm,
  type ValidationAssessment,
} from "@/lib/llmClient";
import { coerceAgentPhase, type AgentPhase } from "@/types/agentPhase";
import * as memory from "./memoryService";
import { buildContextForSession } from "./contextService";
import {
  hasTaskContext,
  isProceedCommand,
  resolvePhaseForUserMessage,
  transitionAfterExecution,
  transitionAfterValidation,
} from "./agentPhaseMachine";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SendMessageResult {
  messageId: string;
  role: "assistant";
  content: string;
  createdAt: string;
  phase: AgentPhase;
  usage?: TokenUsage;
}

const CLEAR_MEMORY_PHRASES = [
  "очисти долговременную память",
  "очисти long term",
  "удали долговременную память",
  "удали long term",
  "стереть память",
  "очисти память",
  "удали память",
  "clear long term memory",
  "clear memory",
  "очисти long term memory",
  "удали long term memory",
];

function isClearMemoryRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  return CLEAR_MEMORY_PHRASES.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

function mergeTokenUsage(parts: Array<{ promptTokens: number; completionTokens: number } | undefined>): TokenUsage | undefined {
  let promptTokens = 0;
  let completionTokens = 0;
  for (const usage of parts) {
    if (!usage) continue;
    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
  }
  if (promptTokens === 0 && completionTokens === 0) return undefined;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function sanitizePlanningReply(content: string): string {
  if (!content.includes("```")) return content;
  return content.replace(/```[\s\S]*?```/g, "[Кодовый блок удалён: в фазе Planning готовое решение не выдаётся.]");
}

function formatValidationChecklist(assessment: ValidationAssessment): string {
  if (assessment.checklist.length === 0) {
    return "- [ ] Требования не извлечены автоматически.";
  }
  return assessment.checklist
    .map((item) => {
      const marker = item.status === "done" ? "[x]" : item.status === "partial" ? "[~]" : "[ ]";
      return `- ${marker} ${item.item}${item.notes ? ` — ${item.notes}` : ""}`;
    })
    .join("\n");
}

function formatValidationSection(assessment: ValidationAssessment): string {
  const risks =
    assessment.risks.length > 0
      ? assessment.risks.map((risk) => `- ${risk}`).join("\n")
      : "- Существенные риски не обнаружены.";
  const verificationSteps =
    assessment.verificationSteps.length > 0
      ? assessment.verificationSteps.map((step) => `- ${step}`).join("\n")
      : "- Проверить вручную ключевой пользовательский сценарий.";

  return [
    "Validation",
    formatValidationChecklist(assessment),
    "",
    "Риски:",
    risks,
    "",
    "Шаги проверки:",
    verificationSteps,
  ].join("\n");
}

function formatDoneSection(): string {
  return [
    "Done",
    "Краткое резюме: результат выполнен и прошёл проверку по чек-листу.",
    "Следующий шаг: если нужен новый запрос или расширение, опишите задачу — цикл начнётся с Planning.",
  ].join("\n");
}

function formatExecutionResponse(
  executionContent: string,
  assessment: ValidationAssessment,
  nextPhase: AgentPhase
): string {
  const sections = [executionContent.trim(), "", formatValidationSection(assessment)];

  if (nextPhase === "Done") {
    sections.push("", formatDoneSection());
  } else {
    const fixes =
      assessment.fixes.length > 0
        ? assessment.fixes.map((fix) => `- ${fix}`).join("\n")
        : "- Уточнить требования и повторить выполнение.";
    sections.push("", "Нужны исправления перед завершением:", fixes);
  }

  return sections.join("\n");
}

function collectRequirementCandidates(userMessages: string[]): string[] {
  return userMessages
    .map((message) => message.trim())
    .filter((message) => message && !isProceedCommand(message))
    .slice(-8);
}

/** Send user message, get assistant reply, persist both, update memories. */
export async function sendMessage(sessionId: string, userContent: string): Promise<SendMessageResult> {
  if (isClearMemoryRequest(userContent)) {
    await memory.clearLongTermMemory("user");
  }

  const [session, previousUserMessages] = await Promise.all([
    prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { agentPhase: true },
    }),
    prisma.message.findMany({
      where: { sessionId, role: "user" },
      orderBy: { createdAt: "asc" },
      select: { content: true },
    }),
  ]);

  if (!session) {
    throw new Error("Session not found");
  }

  const currentPhase = coerceAgentPhase(session.agentPhase);
  const userHistory = previousUserMessages.map((m) => m.content);
  const canProceed = hasTaskContext(userHistory);
  const phaseForTurn = resolvePhaseForUserMessage({
    currentPhase,
    userText: userContent,
    hasTaskContext: canProceed,
  });

  await prisma.message.create({
    data: { sessionId, role: "user", content: userContent },
  });

  let assistantContent = "";
  let nextPhase: AgentPhase = phaseForTurn;
  const usageParts: Array<{ promptTokens: number; completionTokens: number } | undefined> = [];

  if (phaseForTurn === "Planning") {
    const planningMessages = await buildContextForSession(sessionId, "Planning");

    const planningResult = await createChatCompletion(planningMessages);
    usageParts.push(planningResult.usage);
    assistantContent = sanitizePlanningReply(planningResult.content);
    nextPhase = "Planning";
  } else if (phaseForTurn === "Execution") {
    const executionMessages = await buildContextForSession(sessionId, "Execution");

    const executionResult = await createChatCompletion(executionMessages);
    usageParts.push(executionResult.usage);
    const executionContent = executionResult.content.trim();

    const phaseAfterExecution = transitionAfterExecution();
    if (phaseAfterExecution !== "Validation") {
      throw new Error("Invalid state transition after execution");
    }

    const requirements = collectRequirementCandidates(userHistory);
    const validationResult = await createValidationCompletion(requirements, executionContent);
    usageParts.push(validationResult.usage);
    nextPhase = transitionAfterValidation(validationResult.assessment.passed);
    assistantContent = formatExecutionResponse(executionContent, validationResult.assessment, nextPhase);
  } else if (phaseForTurn === "Done") {
    const doneMessages = await buildContextForSession(sessionId, "Done");
    const doneResult = await createChatCompletion(doneMessages);
    usageParts.push(doneResult.usage);
    assistantContent = doneResult.content.trim() || formatDoneSection();
    nextPhase = "Done";
  } else {
    throw new Error(`Unsupported phase transition for message: ${phaseForTurn}`);
  }

  const assistant = await prisma.message.create({
    data: { sessionId, role: "assistant", content: assistantContent },
  });

  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { agentPhase: nextPhase },
  });

  await updateMemoriesAfterReply(sessionId, userContent, assistantContent);

  const tokenUsage = mergeTokenUsage(usageParts);

  return {
    messageId: assistant.id,
    role: "assistant",
    content: assistant.content,
    createdAt: assistant.createdAt.toISOString(),
    phase: nextPhase,
    usage: tokenUsage,
  };
}

async function updateMemoriesAfterReply(
  sessionId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const working = await memory.getWorkingMemory(sessionId);
  const currentWorkingJson = working?.contentJson ?? "{}";

  const { working: newWorkingJson, longTerm: longTermEntries } = await createMemoryUpdateCompletion(
    userMessage,
    assistantReply,
    currentWorkingJson
  );

  let workingText = newWorkingJson;
  try {
    const parsed = JSON.parse(newWorkingJson) as Record<string, unknown>;
    workingText = Object.entries(parsed)
      .filter(([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`)
      .join("\n");
  } catch {
    // keep raw
  }
  await memory.setWorkingMemory(sessionId, workingText, newWorkingJson);

  const validEntries = longTermEntries.filter((e) => e.text.trim());
  if (validEntries.length === 0) return;

  const existingBase = (await memory.getLongTermMemory("user")).map((item) => item.contentText);
  const newFacts = validEntries.map((e) => e.text.trim());
  const saveFlags = await shouldSaveFactsToLongTerm(existingBase, newFacts);

  for (let i = 0; i < validEntries.length; i++) {
    if (!saveFlags[i]) continue;
    const entry = validEntries[i];
    const key = `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const tags = entry.tag ?? "";
    const contentJson = JSON.stringify({ text: entry.text, tag: entry.tag });
    await memory.addLongTermMemory("user", key, entry.text.trim(), contentJson, tags);
  }
}
