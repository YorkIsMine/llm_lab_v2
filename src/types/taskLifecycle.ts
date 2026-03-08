import type { ValidationAssessment } from "@/lib/llmClient";

export const PLANNING_INTENTS = [
  "stay_in_planning",
  "revise_plan",
  "approve_plan_and_execute",
  "unrelated",
  "ambiguous",
] as const;

export type PlanningIntent = (typeof PLANNING_INTENTS)[number];

export const INTENT_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;

export type IntentConfidence = (typeof INTENT_CONFIDENCE_LEVELS)[number];

export interface PlanningIntentAssessment {
  intent: PlanningIntent;
  confidence: IntentConfidence;
  rationale: string;
}

export interface ApprovedPlanSnapshot {
  goal: string;
  plan: string[];
  decisions: string[];
  constraints: string[];
  source: "working_memory_json" | "working_memory_text";
  capturedAt: string;
  approvedAt: string;
  approvedByMessage: string;
  workingMemoryUpdatedAt?: string;
}

export interface ExecutionArtifacts {
  status: "pending" | "produced";
  startedAt: string;
  updatedAt: string;
  approvedPlanCapturedAt: string;
  latestOutput?: string;
  progressSummary?: string;
}

export interface ValidationReport {
  status: "pending" | "passed" | "failed";
  startedAt: string;
  completedAt?: string;
  executionArtifactUpdatedAt?: string;
  assessment?: ValidationAssessment;
}

export const TASK_TRANSITION_STATUSES = ["applied", "blocked"] as const;

export type TaskTransitionStatus = (typeof TASK_TRANSITION_STATUSES)[number];

export interface TaskTransitionEntry {
  id: string;
  sessionId: string;
  fromState: string;
  toState: string;
  status: TaskTransitionStatus;
  reason: string;
  cause: string;
  metadataJson: string | null;
  createdAt: string;
}
