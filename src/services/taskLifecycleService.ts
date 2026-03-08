import { prisma } from "@/lib/db";
import type { WorkingMemoryPayload } from "@/types/memory";
import type {
  ApprovedPlanSnapshot,
  ExecutionArtifacts,
  TaskTransitionEntry,
  ValidationReport,
} from "@/types/taskLifecycle";
import { coerceAgentPhase, type AgentPhase } from "@/types/agentPhase";
import { validateStateTransition, type StateTransitionValidationResult } from "./agentPhaseMachine";
import type { WorkingMemoryView } from "./memoryService";

interface TaskSessionRow {
  id: string;
  agentPhase: string;
  approvedPlanSnapshot: string | null;
  executionArtifacts: string | null;
  validationReport: string | null;
}

export interface TaskLifecycleSnapshot {
  sessionId: string;
  currentState: AgentPhase;
  approvedPlanSnapshot: ApprovedPlanSnapshot | null;
  executionArtifacts: ExecutionArtifacts | null;
  validationReport: ValidationReport | null;
}

interface PlanSnapshotSeed {
  goal: string;
  plan: string[];
  decisions: string[];
  constraints: string[];
  source: ApprovedPlanSnapshot["source"];
  capturedAt: string;
  workingMemoryUpdatedAt?: string;
}

export interface ApplyTaskTransitionParams {
  sessionId: string;
  fromState: AgentPhase;
  toState: AgentPhase;
  reason: string;
  cause: string;
  approvedPlanSnapshot?: ApprovedPlanSnapshot | null;
  executionArtifacts?: ExecutionArtifacts | null;
  validationReport?: ValidationReport | null;
  clearLifecycle?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ApplyTaskTransitionResult {
  allowed: boolean;
  currentState: AgentPhase;
  validation: StateTransitionValidationResult;
}

function parseJsonField<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function serializeJsonField(value: unknown): string | null {
  if (value == null) return null;
  return JSON.stringify(value);
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function buildPlanSnapshotSeed(workingMemory: WorkingMemoryView): PlanSnapshotSeed | null {
  const parsed = parseJsonField<WorkingMemoryPayload>(workingMemory.contentJson);
  const goal = typeof parsed?.goal === "string" ? parsed.goal.trim() : "";
  const plan = normalizeStringList(parsed?.plan);
  const decisions = normalizeStringList(parsed?.decisions);
  const constraints = normalizeStringList(parsed?.constraints);

  if (goal || plan.length > 0 || decisions.length > 0 || constraints.length > 0) {
    return {
      goal,
      plan,
      decisions,
      constraints,
      source: "working_memory_json",
      capturedAt: workingMemory.updatedAt,
      workingMemoryUpdatedAt: workingMemory.updatedAt,
    };
  }

  const fallbackPlan = workingMemory.contentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (fallbackPlan.length === 0) {
    return null;
  }

  return {
    goal: "",
    plan: fallbackPlan,
    decisions: [],
    constraints: [],
    source: "working_memory_text",
    capturedAt: workingMemory.updatedAt,
    workingMemoryUpdatedAt: workingMemory.updatedAt,
  };
}

export function extractApprovedPlanCandidate(workingMemory: WorkingMemoryView | null): Omit<
  ApprovedPlanSnapshot,
  "approvedAt" | "approvedByMessage"
> | null {
  if (!workingMemory) return null;
  return buildPlanSnapshotSeed(workingMemory);
}

export function approvePlanSnapshot(
  candidate: Omit<ApprovedPlanSnapshot, "approvedAt" | "approvedByMessage">,
  userMessage: string,
  approvedAt: string
): ApprovedPlanSnapshot {
  return {
    ...candidate,
    approvedAt,
    approvedByMessage: userMessage,
  };
}

export function createTaskLifecycleSnapshot(row: TaskSessionRow): TaskLifecycleSnapshot {
  return {
    sessionId: row.id,
    currentState: coerceAgentPhase(row.agentPhase),
    approvedPlanSnapshot: parseJsonField<ApprovedPlanSnapshot>(row.approvedPlanSnapshot),
    executionArtifacts: parseJsonField<ExecutionArtifacts>(row.executionArtifacts),
    validationReport: parseJsonField<ValidationReport>(row.validationReport),
  };
}

export async function loadTaskLifecycle(sessionId: string): Promise<TaskLifecycleSnapshot | null> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      agentPhase: true,
      approvedPlanSnapshot: true,
      executionArtifacts: true,
      validationReport: true,
    },
  });
  if (!session) return null;
  return createTaskLifecycleSnapshot(session);
}

export async function getTaskTransitionHistory(sessionId: string): Promise<TaskTransitionEntry[]> {
  const history = await prisma.taskTransition.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  return history.map((item) => ({
    id: item.id,
    sessionId: item.sessionId,
    fromState: item.fromState,
    toState: item.toState,
    status: item.status === "blocked" ? "blocked" : "applied",
    reason: item.reason,
    cause: item.cause,
    metadataJson: item.metadataJson,
    createdAt: item.createdAt.toISOString(),
  }));
}

export function presentTaskState(currentState: AgentPhase): { phase: AgentPhase; currentState: AgentPhase } {
  return {
    phase: currentState,
    currentState,
  };
}

export async function persistTaskLifecycleFields(params: {
  sessionId: string;
  approvedPlanSnapshot?: ApprovedPlanSnapshot | null;
  executionArtifacts?: ExecutionArtifacts | null;
  validationReport?: ValidationReport | null;
}): Promise<void> {
  const data: {
    approvedPlanSnapshot?: string | null;
    executionArtifacts?: string | null;
    validationReport?: string | null;
  } = {};

  if ("approvedPlanSnapshot" in params) {
    data.approvedPlanSnapshot = serializeJsonField(params.approvedPlanSnapshot);
  }
  if ("executionArtifacts" in params) {
    data.executionArtifacts = serializeJsonField(params.executionArtifacts);
  }
  if ("validationReport" in params) {
    data.validationReport = serializeJsonField(params.validationReport);
  }

  if (Object.keys(data).length === 0) return;

  await prisma.chatSession.update({
    where: { id: params.sessionId },
    data,
  });
}

export async function applyTaskTransition(params: ApplyTaskTransitionParams): Promise<ApplyTaskTransitionResult> {
  const validation = validateStateTransition({
    fromState: params.fromState,
    toState: params.toState,
    approvedPlanSnapshot: params.approvedPlanSnapshot,
    executionArtifacts: params.executionArtifacts,
    validationReport: params.validationReport,
    reason: params.reason,
  });

  const baseMetadata = {
    validationCode: validation.code,
    validationMessage: validation.message,
    nextStep: validation.nextStep,
    ...(params.metadata ?? {}),
  };

  if (!validation.allowed) {
    await prisma.taskTransition.create({
      data: {
        sessionId: params.sessionId,
        fromState: params.fromState,
        toState: params.toState,
        status: "blocked",
        reason: params.reason,
        cause: params.cause,
        metadataJson: JSON.stringify(baseMetadata),
      },
    });
    return {
      allowed: false,
      currentState: params.fromState,
      validation,
    };
  }

  const updateData: {
    agentPhase: AgentPhase;
    approvedPlanSnapshot?: string | null;
    executionArtifacts?: string | null;
    validationReport?: string | null;
  } = {
    agentPhase: params.toState,
  };

  if (params.clearLifecycle) {
    updateData.approvedPlanSnapshot = null;
    updateData.executionArtifacts = null;
    updateData.validationReport = null;
  }

  if ("approvedPlanSnapshot" in params) {
    updateData.approvedPlanSnapshot = serializeJsonField(params.approvedPlanSnapshot);
  }
  if ("executionArtifacts" in params) {
    updateData.executionArtifacts = serializeJsonField(params.executionArtifacts);
  }
  if ("validationReport" in params) {
    updateData.validationReport = serializeJsonField(params.validationReport);
  }

  await prisma.$transaction([
    prisma.chatSession.update({
      where: { id: params.sessionId },
      data: updateData,
    }),
    prisma.taskTransition.create({
      data: {
        sessionId: params.sessionId,
        fromState: params.fromState,
        toState: params.toState,
        status: "applied",
        reason: params.reason,
        cause: params.cause,
        metadataJson: JSON.stringify(baseMetadata),
      },
    }),
  ]);

  return {
    allowed: true,
    currentState: params.toState,
    validation,
  };
}
