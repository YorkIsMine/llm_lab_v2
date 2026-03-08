import { prisma } from "@/lib/db";
import {
  createChatCompletion,
  createMemoryUpdateCompletion,
  createPlanningIntentCompletion,
  createValidationCompletion,
  shouldSaveFactsToLongTerm,
  type ValidationAssessment,
} from "@/lib/llmClient";
import { coerceAgentPhase, type AgentPhase } from "@/types/agentPhase";
import type { ApprovedPlanSnapshot, ValidationReport } from "@/types/taskLifecycle";
import * as memory from "./memoryService";
import { buildContextForSession, type PromptInvariantContext } from "./contextService";
import { DEFAULT_INVARIANT_SCOPE_CONTEXT } from "@/types/invariant";
import {
  buildBlockedTransitionReply,
  createPendingExecutionArtifacts,
  createPendingValidationReport,
  finalizeExecutionArtifacts,
  finalizeValidationReport,
  resolveActionForCurrentState,
  resolveNextStateFromValidation,
  resolvePlanningTransition,
} from "./agentPhaseMachine";
import { handleInvariantCommand } from "./invariantCommandService";
import { applyInvariantGuard, ensureInvariantCheck, runInvariantPrecheck } from "./invariantGuard";
import { areInvariantsEnabled, listInvariants } from "./invariantService";
import {
  applyTaskTransition,
  approvePlanSnapshot,
  createTaskLifecycleSnapshot,
  extractApprovedPlanCandidate,
  persistTaskLifecycleFields,
  presentTaskState,
  type TaskLifecycleSnapshot,
} from "./taskLifecycleService";

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
  currentState: AgentPhase;
  usage?: TokenUsage;
  commandHandled?: boolean;
}

interface SendMessageDependencies {
  createChatCompletion: typeof createChatCompletion;
  createPlanningIntentCompletion: typeof createPlanningIntentCompletion;
  createValidationCompletion: typeof createValidationCompletion;
  createMemoryUpdateCompletion: typeof createMemoryUpdateCompletion;
  shouldSaveFactsToLongTerm: typeof shouldSaveFactsToLongTerm;
}

interface TurnResult {
  assistantContent: string;
  nextState: AgentPhase;
  guardStatus: "OK" | "REFUSED" | "SKIPPED";
  violatedIds: string[];
}

const DEFAULT_DEPENDENCIES: SendMessageDependencies = {
  createChatCompletion,
  createPlanningIntentCompletion,
  createValidationCompletion,
  createMemoryUpdateCompletion,
  shouldSaveFactsToLongTerm,
};

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
  return content.replace(/```[\s\S]*?```/g, "[Кодовый блок удалён: в состоянии planning готовое решение не выдаётся.]");
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

function formatValidationSection(report: ValidationReport): string {
  const assessment = report.assessment;
  if (!assessment) {
    return [
      "Validation",
      "- [ ] Проверка ещё не завершена.",
      "",
      "Риски:",
      "- Отчёт validation ещё не сформирован.",
      "",
      "Шаги проверки:",
      "- Повторно запустить validation по сохранённым execution artifacts.",
    ].join("\n");
  }

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

function formatCompletedSection(): string {
  return [
    "Completed",
    "Краткое резюме: результат выполнен и прошёл validation.",
    "Следующий шаг: если нужен новый запрос или расширение, опишите новую задачу — начнётся новый цикл с planning.",
  ].join("\n");
}

function formatExecutionResponse(
  executionContent: string,
  validationReport: ValidationReport,
  nextState: AgentPhase
): string {
  const sections = [executionContent.trim(), "", formatValidationSection(validationReport)];

  if (nextState === "completed") {
    sections.push("", formatCompletedSection());
  } else {
    const fixes =
      validationReport.assessment && validationReport.assessment.fixes.length > 0
        ? validationReport.assessment.fixes.map((fix) => `- ${fix}`).join("\n")
        : "- Уточнить требования и повторить выполнение.";
    sections.push("", "Нужны исправления перед завершением:", fixes);
  }

  return sections.join("\n");
}

function formatValidationResumeResponse(validationReport: ValidationReport, nextState: AgentPhase): string {
  const sections = [formatValidationSection(validationReport)];

  if (nextState === "completed") {
    sections.push("", formatCompletedSection());
  } else {
    const fixes =
      validationReport.assessment && validationReport.assessment.fixes.length > 0
        ? validationReport.assessment.fixes.map((fix) => `- ${fix}`).join("\n")
        : "- Вернуться к execution и доработать результат.";
    sections.push("", "Состояние возвращено в execution. Что исправить:", fixes);
  }

  return sections.join("\n");
}

function buildCurrentPlanText(approvedPlanSnapshot: Omit<ApprovedPlanSnapshot, "approvedAt" | "approvedByMessage"> | null): string {
  if (!approvedPlanSnapshot) return "(no current plan snapshot)";
  const lines = [];
  if (approvedPlanSnapshot.goal) {
    lines.push(`Goal: ${approvedPlanSnapshot.goal}`);
  }
  if (approvedPlanSnapshot.plan.length > 0) {
    lines.push("Plan:");
    lines.push(...approvedPlanSnapshot.plan.map((step, index) => `${index + 1}. ${step}`));
  }
  if (approvedPlanSnapshot.constraints.length > 0) {
    lines.push("Constraints:");
    lines.push(...approvedPlanSnapshot.constraints.map((item) => `- ${item}`));
  }
  return lines.join("\n") || "(no current plan snapshot)";
}

function buildRecentContext(sessionMessages: memory.ShortMemory["messages"]): string[] {
  return sessionMessages.slice(-6).map((message) => `${message.role}: ${message.content}`);
}

function collectValidationRequirements(params: {
  approvedPlanSnapshot: ApprovedPlanSnapshot | null;
  userMessages: string[];
}): string[] {
  const values: string[] = [];
  if (params.approvedPlanSnapshot?.goal) {
    values.push(`Goal: ${params.approvedPlanSnapshot.goal}`);
  }
  params.approvedPlanSnapshot?.plan.forEach((step, index) => {
    values.push(`Approved step ${index + 1}: ${step}`);
  });
  params.approvedPlanSnapshot?.constraints.forEach((constraint) => {
    values.push(`Constraint: ${constraint}`);
  });
  params.userMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-6)
    .forEach((message, index) => {
      values.push(`User context ${index + 1}: ${message}`);
    });

  return Array.from(new Set(values)).slice(-12);
}

function amendValidationReportForGuardFailure(
  validationReport: ValidationReport,
  reason: string
): ValidationReport {
  const existing = validationReport.assessment ?? {
    passed: false,
    checklist: [],
    risks: [],
    verificationSteps: [],
    fixes: [],
  };

  return {
    ...validationReport,
    status: "failed",
    assessment: {
      ...existing,
      passed: false,
      risks: [...existing.risks, reason].filter(Boolean),
      fixes: [...existing.fixes, "Подготовить результат, который соблюдает активные инварианты."].filter(Boolean),
    },
  };
}

function buildWorkflowContext(lifecycle: TaskLifecycleSnapshot) {
  return {
    currentState: lifecycle.currentState,
    approvedPlanSnapshot: lifecycle.approvedPlanSnapshot,
    executionArtifacts: lifecycle.executionArtifacts,
    validationReport: lifecycle.validationReport,
  };
}

async function finalizeValidationState(params: {
  sessionId: string;
  userContent: string;
  lifecycle: TaskLifecycleSnapshot;
  validationReport: ValidationReport;
  draftReply: string;
  proposedNextState: AgentPhase;
  invariantsEnabled: boolean;
  activeInvariants: Awaited<ReturnType<typeof listInvariants>>;
}): Promise<TurnResult> {
  let finalValidationReport = params.validationReport;
  let assistantContent = params.draftReply;
  let nextState = params.proposedNextState;
  let guardStatus: TurnResult["guardStatus"] = "SKIPPED";
  let violatedIds: string[] = [];

  if (params.invariantsEnabled) {
    const guardResult = applyInvariantGuard({
      userMessage: params.userContent,
      draftAnswer: assistantContent,
      invariants: params.activeInvariants,
      enabled: params.invariantsEnabled,
    });

    assistantContent = guardResult.content;
    guardStatus = guardResult.status;
    violatedIds = guardResult.violatedIds;

    if (guardResult.status !== "OK") {
      finalValidationReport = amendValidationReportForGuardFailure(
        finalValidationReport,
        "Финальный ответ заблокирован invariant guard."
      );
      nextState = "execution";
    }
  }

  const transition = await applyTaskTransition({
    sessionId: params.sessionId,
    fromState: "validation",
    toState: nextState,
    reason: nextState === "completed" ? "validation_passed" : "validation_failed",
    cause: guardStatus === "REFUSED" ? "invariant_guard" : "validation_result",
    approvedPlanSnapshot: params.lifecycle.approvedPlanSnapshot,
    executionArtifacts: params.lifecycle.executionArtifacts,
    validationReport: finalValidationReport,
    metadata: {
      validationStatus: finalValidationReport.status,
      invariantGuardStatus: guardStatus,
      violatedIds,
    },
  });

  if (!transition.allowed) {
    assistantContent = buildBlockedTransitionReply({
      currentState: "validation",
      attemptedState: nextState,
      validation: transition.validation,
    });
    nextState = transition.currentState;
  }

  return {
    assistantContent,
    nextState,
    guardStatus,
    violatedIds,
  };
}

async function runValidationTurn(params: {
  sessionId: string;
  userContent: string;
  userHistory: string[];
  lifecycle: TaskLifecycleSnapshot;
  usageParts: Array<{ promptTokens: number; completionTokens: number } | undefined>;
  deps: SendMessageDependencies;
  invariantsEnabled: boolean;
  activeInvariants: Awaited<ReturnType<typeof listInvariants>>;
  executionContentForReply?: string;
}): Promise<TurnResult> {
  const executionArtifacts = params.lifecycle.executionArtifacts;
  if (!executionArtifacts?.latestOutput) {
    return {
      assistantContent: buildBlockedTransitionReply({
        currentState: "validation",
        attemptedState: "completed",
        validation: {
          allowed: false,
          code: "missing_execution_artifact",
          message: "Нельзя продолжить validation без сохранённого execution artifact.",
          nextStep: "Вернитесь в execution и заново выполните утверждённый план.",
        },
      }),
      nextState: "validation",
      guardStatus: "SKIPPED",
      violatedIds: [],
    };
  }

  let validationReport = params.lifecycle.validationReport;
  if (!validationReport || validationReport.status !== "pending") {
    validationReport = createPendingValidationReport(executionArtifacts, new Date().toISOString());
    await persistTaskLifecycleFields({
      sessionId: params.sessionId,
      validationReport,
    });
  }

  const requirements = collectValidationRequirements({
    approvedPlanSnapshot: params.lifecycle.approvedPlanSnapshot,
    userMessages: params.userHistory,
  });

  const validationResult = await params.deps.createValidationCompletion(requirements, executionArtifacts.latestOutput);
  params.usageParts.push(validationResult.usage);

  const completedReport = finalizeValidationReport(validationReport, validationResult.assessment, new Date().toISOString());
  const proposedNextState = resolveNextStateFromValidation(completedReport);
  const draftReply = params.executionContentForReply
    ? formatExecutionResponse(params.executionContentForReply, completedReport, proposedNextState)
    : formatValidationResumeResponse(completedReport, proposedNextState);

  return finalizeValidationState({
    sessionId: params.sessionId,
    userContent: params.userContent,
    lifecycle: {
      ...params.lifecycle,
      validationReport: completedReport,
    },
    validationReport: completedReport,
    draftReply,
    proposedNextState,
    invariantsEnabled: params.invariantsEnabled,
    activeInvariants: params.activeInvariants,
  });
}

async function runExecutionTurn(params: {
  sessionId: string;
  userContent: string;
  userHistory: string[];
  lifecycle: TaskLifecycleSnapshot;
  usageParts: Array<{ promptTokens: number; completionTokens: number } | undefined>;
  deps: SendMessageDependencies;
  invariantContext: PromptInvariantContext;
  invariantsEnabled: boolean;
  activeInvariants: Awaited<ReturnType<typeof listInvariants>>;
}): Promise<TurnResult> {
  const approvedPlanSnapshot = params.lifecycle.approvedPlanSnapshot;
  if (!approvedPlanSnapshot) {
    return {
      assistantContent: buildBlockedTransitionReply({
        currentState: "execution",
        attemptedState: "validation",
        validation: {
          allowed: false,
          code: "missing_approved_plan",
          message: "Execution не может продолжаться без approved plan snapshot.",
          nextStep: "Вернитесь к planning, зафиксируйте план и подтвердите старт выполнения заново.",
        },
      }),
      nextState: "execution",
      guardStatus: "SKIPPED",
      violatedIds: [],
    };
  }

  let executionArtifacts = params.lifecycle.executionArtifacts;
  if (!executionArtifacts || executionArtifacts.status !== "pending") {
    executionArtifacts = createPendingExecutionArtifacts(approvedPlanSnapshot, new Date().toISOString());
    await persistTaskLifecycleFields({
      sessionId: params.sessionId,
      executionArtifacts,
    });
  }

  const executionMessages = await buildContextForSession(
    params.sessionId,
    "execution",
    params.invariantContext,
    buildWorkflowContext({
      ...params.lifecycle,
      executionArtifacts,
    })
  );

  const executionResult = await params.deps.createChatCompletion(executionMessages);
  params.usageParts.push(executionResult.usage);

  const executionContent = executionResult.content.trim();
  const producedArtifacts = finalizeExecutionArtifacts(executionArtifacts, executionContent, new Date().toISOString());
  const pendingValidationReport = createPendingValidationReport(producedArtifacts, new Date().toISOString());

  const executionToValidation = await applyTaskTransition({
    sessionId: params.sessionId,
    fromState: "execution",
    toState: "validation",
    reason: "execution_completed",
    cause: "assistant_execution",
    approvedPlanSnapshot,
    executionArtifacts: producedArtifacts,
    validationReport: pendingValidationReport,
    metadata: {
      approvedPlanCapturedAt: approvedPlanSnapshot.capturedAt,
      executionOutputSize: executionContent.length,
    },
  });

  if (!executionToValidation.allowed) {
    return {
      assistantContent: buildBlockedTransitionReply({
        currentState: "execution",
        attemptedState: "validation",
        validation: executionToValidation.validation,
      }),
      nextState: executionToValidation.currentState,
      guardStatus: "SKIPPED",
      violatedIds: [],
    };
  }

  return runValidationTurn({
    sessionId: params.sessionId,
    userContent: params.userContent,
    userHistory: params.userHistory,
    lifecycle: {
      ...params.lifecycle,
      currentState: "validation",
      executionArtifacts: producedArtifacts,
      validationReport: pendingValidationReport,
    },
    usageParts: params.usageParts,
    deps: params.deps,
    invariantsEnabled: params.invariantsEnabled,
    activeInvariants: params.activeInvariants,
    executionContentForReply: executionContent,
  });
}

async function runPlanningTurn(params: {
  sessionId: string;
  userContent: string;
  lifecycle: TaskLifecycleSnapshot;
  usageParts: Array<{ promptTokens: number; completionTokens: number } | undefined>;
  deps: SendMessageDependencies;
  invariantContext: PromptInvariantContext;
  invariantsEnabled: boolean;
  activeInvariants: Awaited<ReturnType<typeof listInvariants>>;
  userHistory: string[];
}): Promise<TurnResult> {
  const workingMemory = await memory.getWorkingMemory(params.sessionId);
  const shortMemory = await memory.getShortMemory(params.sessionId);
  const currentPlanCandidate = extractApprovedPlanCandidate(workingMemory);

  const intentResult = await params.deps.createPlanningIntentCompletion({
    currentState: params.lifecycle.currentState,
    userMessage: params.userContent,
    recentContext: buildRecentContext(shortMemory.messages),
    currentPlan: buildCurrentPlanText(currentPlanCandidate),
  });
  params.usageParts.push(intentResult.usage);

  const approvedPlanSnapshot = currentPlanCandidate
    ? approvePlanSnapshot(currentPlanCandidate, params.userContent, new Date().toISOString())
    : null;
  const planningResolution = resolvePlanningTransition({
    currentState: params.lifecycle.currentState,
    intent: intentResult.assessment,
    approvedPlanSnapshot,
  });

  if (planningResolution.shouldExecute && approvedPlanSnapshot) {
    const pendingExecutionArtifacts = createPendingExecutionArtifacts(approvedPlanSnapshot, new Date().toISOString());
    const transition = await applyTaskTransition({
      sessionId: params.sessionId,
      fromState: "planning",
      toState: "execution",
      reason: planningResolution.reason,
      cause: planningResolution.cause,
      approvedPlanSnapshot,
      executionArtifacts: pendingExecutionArtifacts,
      validationReport: null,
      metadata: {
        intent: intentResult.assessment.intent,
        confidence: intentResult.assessment.confidence,
        rationale: intentResult.assessment.rationale,
      },
    });

    if (!transition.allowed) {
      return {
        assistantContent: buildBlockedTransitionReply({
          currentState: "planning",
          attemptedState: "execution",
          validation: transition.validation,
        }),
        nextState: transition.currentState,
        guardStatus: "SKIPPED",
        violatedIds: [],
      };
    }

    return runExecutionTurn({
      sessionId: params.sessionId,
      userContent: params.userContent,
      userHistory: params.userHistory,
      lifecycle: {
        ...params.lifecycle,
        currentState: "execution",
        approvedPlanSnapshot,
        executionArtifacts: pendingExecutionArtifacts,
        validationReport: null,
      },
      usageParts: params.usageParts,
      deps: params.deps,
      invariantContext: params.invariantContext,
      invariantsEnabled: params.invariantsEnabled,
      activeInvariants: params.activeInvariants,
    });
  }

  if (planningResolution.blocked) {
    const blocked = await applyTaskTransition({
      sessionId: params.sessionId,
      fromState: "planning",
      toState: "execution",
      reason: planningResolution.reason,
      cause: planningResolution.cause,
      approvedPlanSnapshot,
      metadata: {
        intent: intentResult.assessment.intent,
        confidence: intentResult.assessment.confidence,
        rationale: intentResult.assessment.rationale,
      },
    });

    return {
      assistantContent:
        planningResolution.message ??
        buildBlockedTransitionReply({
          currentState: "planning",
          attemptedState: "execution",
          validation: blocked.validation,
        }),
      nextState: blocked.currentState,
      guardStatus: "SKIPPED",
      violatedIds: [],
    };
  }

  await applyTaskTransition({
    sessionId: params.sessionId,
    fromState: "planning",
    toState: "planning",
    reason: planningResolution.reason,
    cause: planningResolution.cause,
    metadata: {
      intent: intentResult.assessment.intent,
      confidence: intentResult.assessment.confidence,
      rationale: intentResult.assessment.rationale,
    },
  });

  const planningMessages = await buildContextForSession(
    params.sessionId,
    "planning",
    params.invariantContext,
    buildWorkflowContext(params.lifecycle)
  );

  const planningResult = await params.deps.createChatCompletion(planningMessages);
  params.usageParts.push(planningResult.usage);

  let assistantContent = sanitizePlanningReply(planningResult.content);
  let guardStatus: TurnResult["guardStatus"] = "SKIPPED";
  let violatedIds: string[] = [];

  if (params.invariantsEnabled) {
    const guardResult = applyInvariantGuard({
      userMessage: params.userContent,
      draftAnswer: assistantContent,
      invariants: params.activeInvariants,
      enabled: params.invariantsEnabled,
    });
    assistantContent = guardResult.content;
    guardStatus = guardResult.status;
    violatedIds = guardResult.violatedIds;
  }

  return {
    assistantContent,
    nextState: "planning",
    guardStatus,
    violatedIds,
  };
}

/** Send user message, get assistant reply, persist both, update memories. */
export async function sendMessage(
  sessionId: string,
  userContent: string,
  deps: SendMessageDependencies = DEFAULT_DEPENDENCIES
): Promise<SendMessageResult> {
  if (isClearMemoryRequest(userContent)) {
    await memory.clearLongTermMemory("user");
  }

  const [session, previousUserMessages] = await Promise.all([
    prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        agentPhase: true,
        approvedPlanSnapshot: true,
        executionArtifacts: true,
        validationReport: true,
      },
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

  let lifecycle = createTaskLifecycleSnapshot(session);
  const currentState = coerceAgentPhase(session.agentPhase);

  const invariantCommand = await handleInvariantCommand(userContent, DEFAULT_INVARIANT_SCOPE_CONTEXT);
  if (invariantCommand.handled) {
    const commandReply = ensureInvariantCheck(invariantCommand.content ?? "Готово.", "OK");
    return {
      messageId: `invariant-cmd-${Date.now()}`,
      role: "assistant",
      content: commandReply,
      createdAt: new Date().toISOString(),
      ...presentTaskState(currentState),
      commandHandled: true,
    };
  }

  await prisma.message.create({
    data: { sessionId, role: "user", content: userContent },
  });

  const userHistory = [...previousUserMessages.map((m) => m.content), userContent];
  const [invariantsEnabled, activeInvariants] = await Promise.all([
    areInvariantsEnabled(DEFAULT_INVARIANT_SCOPE_CONTEXT),
    listInvariants(DEFAULT_INVARIANT_SCOPE_CONTEXT, { status: "active" }),
  ]);
  const precheck = runInvariantPrecheck({
    userMessage: userContent,
    invariants: activeInvariants,
    enabled: invariantsEnabled,
  });

  const invariantContext: PromptInvariantContext = {
    enabled: invariantsEnabled,
    invariants: activeInvariants,
    constraints: precheck.constraints,
    requestProposal: precheck.proposal,
    preGenerationDecision: precheck.decision,
  };

  const usageParts: Array<{ promptTokens: number; completionTokens: number } | undefined> = [];
  let turnResult: TurnResult;

  if (precheck.decision.decision !== "ALLOW") {
    turnResult = {
      assistantContent:
        precheck.content ??
        ensureInvariantCheck("Не могу предложить этот путь из-за активных инвариантов.", "REFUSED"),
      nextState: lifecycle.currentState,
      guardStatus: "REFUSED",
      violatedIds: precheck.decision.violatedConstraints,
    };
  } else {
    if (lifecycle.currentState === "completed") {
      const restart = await applyTaskTransition({
        sessionId,
        fromState: "completed",
        toState: "planning",
        reason: "new_task_requested",
        cause: "user_message",
        clearLifecycle: true,
        metadata: {
          userMessage: userContent,
        },
      });

      if (!restart.allowed) {
        turnResult = {
          assistantContent: buildBlockedTransitionReply({
            currentState: "completed",
            attemptedState: "planning",
            validation: restart.validation,
          }),
          nextState: restart.currentState,
          guardStatus: "SKIPPED",
          violatedIds: [],
        };
      } else {
        lifecycle = {
          ...lifecycle,
          currentState: "planning",
          approvedPlanSnapshot: null,
          executionArtifacts: null,
          validationReport: null,
        };
        const action = resolveActionForCurrentState(lifecycle);
        if (action.kind !== "planning_dialogue") {
          turnResult = {
            assistantContent: action.message ?? "Не удалось начать новый цикл задачи.",
            nextState: lifecycle.currentState,
            guardStatus: "SKIPPED",
            violatedIds: [],
          };
        } else {
          turnResult = await runPlanningTurn({
            sessionId,
            userContent,
            lifecycle,
            usageParts,
            deps,
            invariantContext,
            invariantsEnabled,
            activeInvariants,
            userHistory,
          });
        }
      }
    } else {
      const action = resolveActionForCurrentState(lifecycle);
      if (action.kind === "blocked") {
        turnResult = {
          assistantContent: action.message ?? "Переход заблокирован.",
          nextState: lifecycle.currentState,
          guardStatus: "SKIPPED",
          violatedIds: [],
        };
      } else if (action.kind === "planning_dialogue") {
        turnResult = await runPlanningTurn({
          sessionId,
          userContent,
          lifecycle,
          usageParts,
          deps,
          invariantContext,
          invariantsEnabled,
          activeInvariants,
          userHistory,
        });
      } else if (action.kind === "execute_approved_plan") {
        turnResult = await runExecutionTurn({
          sessionId,
          userContent,
          userHistory,
          lifecycle,
          usageParts,
          deps,
          invariantContext,
          invariantsEnabled,
          activeInvariants,
        });
      } else if (action.kind === "validate_execution_result") {
        turnResult = await runValidationTurn({
          sessionId,
          userContent,
          userHistory,
          lifecycle,
          usageParts,
          deps,
          invariantsEnabled,
          activeInvariants,
        });
      } else {
        turnResult = {
          assistantContent: "Текущий цикл завершён. Отправьте новый запрос, чтобы начать planning.",
          nextState: lifecycle.currentState,
          guardStatus: "SKIPPED",
          violatedIds: [],
        };
      }
    }
  }

  console.info(
    `[workflow] session=${sessionId} state=${currentState}->${turnResult.nextState} precheck=${precheck.decision.decision} guard=${turnResult.guardStatus} violated=${turnResult.violatedIds.join(",") || "-"}`
  );

  const assistant = await prisma.message.create({
    data: { sessionId, role: "assistant", content: turnResult.assistantContent },
  });

  if (turnResult.guardStatus !== "REFUSED") {
    await updateMemoriesAfterReply(sessionId, userContent, turnResult.assistantContent, deps);
  }

  const tokenUsage = mergeTokenUsage(usageParts);

  return {
    messageId: assistant.id,
    role: "assistant",
    content: assistant.content,
    createdAt: assistant.createdAt.toISOString(),
    ...presentTaskState(turnResult.nextState),
    usage: tokenUsage,
  };
}

async function updateMemoriesAfterReply(
  sessionId: string,
  userMessage: string,
  assistantReply: string,
  deps: SendMessageDependencies
): Promise<void> {
  const working = await memory.getWorkingMemory(sessionId);
  const currentWorkingJson = working?.contentJson ?? "{}";

  const { working: newWorkingJson, longTerm: longTermEntries } = await deps.createMemoryUpdateCompletion(
    userMessage,
    assistantReply,
    currentWorkingJson
  );

  let workingText = newWorkingJson;
  try {
    const parsed = JSON.parse(newWorkingJson) as Record<string, unknown>;
    workingText = Object.entries(parsed)
      .filter(([, value]) => value != null && (Array.isArray(value) ? value.length > 0 : String(value).trim() !== ""))
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join("; ") : value}`)
      .join("\n");
  } catch {
    // keep raw JSON text
  }
  await memory.setWorkingMemory(sessionId, workingText, newWorkingJson);

  const validEntries = longTermEntries.filter((entry) => entry.text.trim());
  if (validEntries.length === 0) return;

  const existingBase = (await memory.getLongTermMemory("user")).map((item) => item.contentText);
  const newFacts = validEntries.map((entry) => entry.text.trim());
  const saveFlags = await deps.shouldSaveFactsToLongTerm(existingBase, newFacts);

  for (let i = 0; i < validEntries.length; i++) {
    if (!saveFlags[i]) continue;
    const entry = validEntries[i];
    const key = `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const tags = entry.tag ?? "";
    const contentJson = JSON.stringify({ text: entry.text, tag: entry.tag });
    await memory.addLongTermMemory("user", key, entry.text.trim(), contentJson, tags);
  }
}
