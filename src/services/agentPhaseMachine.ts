import { formatAgentPhaseLabel, type AgentPhase } from "@/types/agentPhase";
import type {
  ApprovedPlanSnapshot,
  ExecutionArtifacts,
  PlanningIntentAssessment,
  ValidationReport,
} from "@/types/taskLifecycle";

export const ALLOWED_STATE_TRANSITIONS: Record<AgentPhase, readonly AgentPhase[]> = {
  planning: ["planning", "execution"],
  execution: ["validation"],
  validation: ["execution", "completed"],
  completed: ["planning"],
};

export interface StateTransitionValidationInput {
  fromState: AgentPhase;
  toState: AgentPhase;
  approvedPlanSnapshot?: ApprovedPlanSnapshot | null;
  executionArtifacts?: ExecutionArtifacts | null;
  validationReport?: ValidationReport | null;
  reason?: string;
}

export interface StateTransitionValidationResult {
  allowed: boolean;
  code:
    | "ok"
    | "illegal_transition"
    | "missing_approved_plan"
    | "missing_execution_artifact"
    | "missing_validation_report"
    | "validation_not_successful"
    | "validation_already_successful"
    | "missing_new_task_reason";
  message: string;
  nextStep: string;
}

export interface PlanningTransitionResolution {
  targetState: AgentPhase;
  shouldExecute: boolean;
  blocked: boolean;
  reason: string;
  cause: string;
  message?: string;
}

export interface StateActionResolution {
  kind:
    | "planning_dialogue"
    | "execute_approved_plan"
    | "validate_execution_result"
    | "start_new_task_cycle"
    | "blocked";
  currentState: AgentPhase;
  message?: string;
}

function formatState(state: AgentPhase): string {
  return formatAgentPhaseLabel(state);
}

export function validateStateTransition(input: StateTransitionValidationInput): StateTransitionValidationResult {
  const legalTargets = ALLOWED_STATE_TRANSITIONS[input.fromState] ?? [];
  if (!legalTargets.includes(input.toState)) {
    return {
      allowed: false,
      code: "illegal_transition",
      message: `Недопустимый переход ${formatState(input.fromState)} -> ${formatState(input.toState)}.`,
      nextStep: `Оставайтесь в ${formatState(input.fromState)} и выполняйте только разрешённый следующий шаг.`,
    };
  }

  if (input.fromState === "planning" && input.toState === "execution" && !input.approvedPlanSnapshot) {
    return {
      allowed: false,
      code: "missing_approved_plan",
      message: "Нельзя начать execution без зафиксированного approved plan snapshot.",
      nextStep: "Сначала уточните или обновите план, затем семантически подтвердите старт выполнения.",
    };
  }

  if (input.fromState === "execution" && input.toState === "validation" && !input.executionArtifacts?.latestOutput) {
    return {
      allowed: false,
      code: "missing_execution_artifact",
      message: "Нельзя перейти в validation без фактического execution artifact.",
      nextStep: "Сначала выполните утверждённый план и сохраните результат выполнения.",
    };
  }

  if (input.fromState === "validation" && !input.validationReport?.assessment) {
    return {
      allowed: false,
      code: "missing_validation_report",
      message: "Нельзя завершить переход из validation без validation report.",
      nextStep: "Сначала выполните и сохраните реальную проверку результата.",
    };
  }

  if (input.fromState === "validation" && input.toState === "completed" && input.validationReport?.assessment?.passed !== true) {
    return {
      allowed: false,
      code: "validation_not_successful",
      message: "Completed допустим только после успешной validation.",
      nextStep: "Исправьте найденные проблемы и повторно проверьте результат.",
    };
  }

  if (input.fromState === "validation" && input.toState === "execution" && input.validationReport?.assessment?.passed === true) {
    return {
      allowed: false,
      code: "validation_already_successful",
      message: "После успешной validation нельзя возвращаться в execution без явного reopen-сценария.",
      nextStep: "Завершите задачу переходом в completed либо начните новый цикл задачи.",
    };
  }

  if (input.fromState === "completed" && input.toState === "planning" && !input.reason) {
    return {
      allowed: false,
      code: "missing_new_task_reason",
      message: "Новый цикл задачи из completed должен иметь явную причину.",
      nextStep: "Зафиксируйте причину нового цикла задачи и только затем переходите в planning.",
    };
  }

  return {
    allowed: true,
    code: "ok",
    message: "Transition allowed.",
    nextStep: "",
  };
}

export function buildBlockedTransitionReply(params: {
  currentState: AgentPhase;
  attemptedState: AgentPhase;
  validation: StateTransitionValidationResult;
}): string {
  return [
    `Текущее состояние: ${params.currentState}.`,
    `Переход в ${params.attemptedState} заблокирован: ${params.validation.message}`,
    `Что дальше: ${params.validation.nextStep}`,
  ].join("\n");
}

export function resolvePlanningTransition(params: {
  currentState: AgentPhase;
  intent: PlanningIntentAssessment;
  approvedPlanSnapshot: ApprovedPlanSnapshot | null;
}): PlanningTransitionResolution {
  if (params.currentState !== "planning") {
    return {
      targetState: params.currentState,
      shouldExecute: false,
      blocked: true,
      reason: "planning_intent_used_outside_planning",
      cause: "workflow_guard",
      message: `Planning evaluator нельзя использовать в состоянии ${params.currentState}.`,
    };
  }

  if (params.intent.intent !== "approve_plan_and_execute") {
    return {
      targetState: "planning",
      shouldExecute: false,
      blocked: false,
      reason: `planning_intent:${params.intent.intent}`,
      cause: "semantic_intent",
    };
  }

  if (params.intent.confidence !== "high") {
    return {
      targetState: "planning",
      shouldExecute: false,
      blocked: false,
      reason: "planning_intent:ambiguous_approval",
      cause: "semantic_intent",
    };
  }

  const validation = validateStateTransition({
    fromState: "planning",
    toState: "execution",
    approvedPlanSnapshot: params.approvedPlanSnapshot,
    reason: params.intent.rationale,
  });

  if (!validation.allowed) {
    return {
      targetState: "planning",
      shouldExecute: false,
      blocked: true,
      reason: "planning_to_execution_blocked",
      cause: "workflow_guard",
      message: buildBlockedTransitionReply({
        currentState: "planning",
        attemptedState: "execution",
        validation,
      }),
    };
  }

  return {
    targetState: "execution",
    shouldExecute: true,
    blocked: false,
    reason: `plan_approved:${params.intent.intent}`,
    cause: "semantic_intent",
  };
}

export function createPendingExecutionArtifacts(
  approvedPlanSnapshot: ApprovedPlanSnapshot,
  now: string
): ExecutionArtifacts {
  return {
    status: "pending",
    startedAt: now,
    updatedAt: now,
    approvedPlanCapturedAt: approvedPlanSnapshot.capturedAt,
  };
}

export function finalizeExecutionArtifacts(
  artifacts: ExecutionArtifacts,
  executionOutput: string,
  now: string
): ExecutionArtifacts {
  return {
    ...artifacts,
    status: "produced",
    updatedAt: now,
    latestOutput: executionOutput,
    progressSummary: executionOutput.slice(0, 280),
  };
}

export function createPendingValidationReport(
  executionArtifacts: ExecutionArtifacts,
  now: string
): ValidationReport {
  return {
    status: "pending",
    startedAt: now,
    executionArtifactUpdatedAt: executionArtifacts.updatedAt,
  };
}

export function finalizeValidationReport(
  validationReport: ValidationReport,
  assessment: NonNullable<ValidationReport["assessment"]>,
  now: string
): ValidationReport {
  return {
    ...validationReport,
    status: assessment.passed ? "passed" : "failed",
    completedAt: now,
    assessment,
  };
}

export function resolveNextStateFromValidation(validationReport: ValidationReport): AgentPhase {
  return validationReport.assessment?.passed ? "completed" : "execution";
}

export function resolveActionForCurrentState(params: {
  currentState: AgentPhase;
  approvedPlanSnapshot: ApprovedPlanSnapshot | null;
  executionArtifacts: ExecutionArtifacts | null;
}): StateActionResolution {
  if (params.currentState === "planning") {
    return { kind: "planning_dialogue", currentState: "planning" };
  }

  if (params.currentState === "execution") {
    if (params.approvedPlanSnapshot) {
      return { kind: "execute_approved_plan", currentState: "execution" };
    }
    return {
      kind: "blocked",
      currentState: "execution",
      message: buildBlockedTransitionReply({
        currentState: "execution",
        attemptedState: "validation",
        validation: {
          allowed: false,
          code: "missing_approved_plan",
          message: "Execution не может продолжаться без approved plan snapshot.",
          nextStep: "Вернитесь к planning, заново зафиксируйте план и только затем продолжайте.",
        },
      }),
    };
  }

  if (params.currentState === "validation") {
    if (params.executionArtifacts?.latestOutput) {
      return { kind: "validate_execution_result", currentState: "validation" };
    }
    return {
      kind: "blocked",
      currentState: "validation",
      message: buildBlockedTransitionReply({
        currentState: "validation",
        attemptedState: "completed",
        validation: {
          allowed: false,
          code: "missing_execution_artifact",
          message: "Validation не может продолжаться без execution artifact.",
          nextStep: "Вернитесь в execution, заново выполните план и сохраните результат.",
        },
      }),
    };
  }

  return { kind: "start_new_task_cycle", currentState: "completed" };
}
