import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlockedTransitionReply,
  createPendingExecutionArtifacts,
  createPendingValidationReport,
  finalizeExecutionArtifacts,
  finalizeValidationReport,
  resolveActionForCurrentState,
  resolvePlanningTransition,
  resolveNextStateFromValidation,
  validateStateTransition,
} from "./agentPhaseMachine";
import type { ApprovedPlanSnapshot } from "@/types/taskLifecycle";

const approvedPlanSnapshot: ApprovedPlanSnapshot = {
  goal: "Deliver the feature",
  plan: ["Implement endpoint", "Add tests"],
  decisions: ["Keep existing API surface"],
  constraints: ["No direct DB access from UI"],
  source: "working_memory_json",
  capturedAt: "2026-03-08T10:00:00.000Z",
  approvedAt: "2026-03-08T10:01:00.000Z",
  approvedByMessage: "Можем начинать по этому плану.",
  workingMemoryUpdatedAt: "2026-03-08T10:00:00.000Z",
};

test("blocks illegal planning -> completed transition", () => {
  const validation = validateStateTransition({
    fromState: "planning",
    toState: "completed",
  });

  assert.equal(validation.allowed, false);
  assert.equal(validation.code, "illegal_transition");
});

test("keeps planning when semantic evaluator has not approved execution", () => {
  const decision = resolvePlanningTransition({
    currentState: "planning",
    approvedPlanSnapshot,
    intent: {
      intent: "revise_plan",
      confidence: "high",
      rationale: "The user is still changing the implementation details.",
    },
  });

  assert.equal(decision.targetState, "planning");
  assert.equal(decision.shouldExecute, false);
  assert.equal(decision.blocked, false);
});

test("blocks planning -> execution when the plan is still missing even if user wants to start", () => {
  const decision = resolvePlanningTransition({
    currentState: "planning",
    approvedPlanSnapshot: null,
    intent: {
      intent: "approve_plan_and_execute",
      confidence: "high",
      rationale: "The user is authorizing execution.",
    },
  });

  assert.equal(decision.targetState, "planning");
  assert.equal(decision.shouldExecute, false);
  assert.equal(decision.blocked, true);
  assert.match(decision.message ?? "", /Переход в execution заблокирован/);
});

test("allows planning -> execution when semantic approval arrives with an approved plan snapshot", () => {
  const decision = resolvePlanningTransition({
    currentState: "planning",
    approvedPlanSnapshot,
    intent: {
      intent: "approve_plan_and_execute",
      confidence: "high",
      rationale: "The user approves the plan in meaning, not by keyword.",
    },
  });

  assert.equal(decision.targetState, "execution");
  assert.equal(decision.shouldExecute, true);
  assert.equal(decision.blocked, false);
});

test("stays in planning when approval intent is not confident enough", () => {
  const decision = resolvePlanningTransition({
    currentState: "planning",
    approvedPlanSnapshot,
    intent: {
      intent: "approve_plan_and_execute",
      confidence: "medium",
      rationale: "The message might be approval, but confidence is not high.",
    },
  });

  assert.equal(decision.targetState, "planning");
  assert.equal(decision.shouldExecute, false);
  assert.equal(decision.blocked, false);
});

test("execution must go through validation and cannot jump to completed", () => {
  const invalid = validateStateTransition({
    fromState: "execution",
    toState: "completed",
  });
  assert.equal(invalid.allowed, false);
  assert.equal(invalid.code, "illegal_transition");

  const pendingArtifacts = createPendingExecutionArtifacts(approvedPlanSnapshot, "2026-03-08T10:02:00.000Z");
  const producedArtifacts = finalizeExecutionArtifacts(
    pendingArtifacts,
    "Endpoint + tests implemented",
    "2026-03-08T10:03:00.000Z"
  );
  const valid = validateStateTransition({
    fromState: "execution",
    toState: "validation",
    executionArtifacts: producedArtifacts,
  });

  assert.equal(valid.allowed, true);
});

test("validation returns to execution when checks fail", () => {
  const pendingArtifacts = createPendingExecutionArtifacts(approvedPlanSnapshot, "2026-03-08T10:02:00.000Z");
  const producedArtifacts = finalizeExecutionArtifacts(
    pendingArtifacts,
    "Endpoint implemented without tests",
    "2026-03-08T10:03:00.000Z"
  );
  const pendingValidation = createPendingValidationReport(producedArtifacts, "2026-03-08T10:04:00.000Z");
  const failedValidation = finalizeValidationReport(
    pendingValidation,
    {
      passed: false,
      checklist: [{ item: "Tests", status: "missing", notes: "No tests were added." }],
      risks: ["Regression risk remains high."],
      verificationSteps: ["Add automated tests."],
      fixes: ["Cover the endpoint with tests."],
    },
    "2026-03-08T10:05:00.000Z"
  );

  const validation = validateStateTransition({
    fromState: "validation",
    toState: "execution",
    validationReport: failedValidation,
  });

  assert.equal(validation.allowed, true);
  assert.equal(resolveNextStateFromValidation(failedValidation), "execution");
});

test("validation moves to completed only after a successful report", () => {
  const pendingArtifacts = createPendingExecutionArtifacts(approvedPlanSnapshot, "2026-03-08T10:02:00.000Z");
  const producedArtifacts = finalizeExecutionArtifacts(
    pendingArtifacts,
    "Endpoint + tests implemented",
    "2026-03-08T10:03:00.000Z"
  );
  const pendingValidation = createPendingValidationReport(producedArtifacts, "2026-03-08T10:04:00.000Z");
  const passedValidation = finalizeValidationReport(
    pendingValidation,
    {
      passed: true,
      checklist: [{ item: "Tests", status: "done", notes: "Added coverage." }],
      risks: [],
      verificationSteps: ["Run the API test suite."],
      fixes: [],
    },
    "2026-03-08T10:05:00.000Z"
  );

  const validation = validateStateTransition({
    fromState: "validation",
    toState: "completed",
    validationReport: passedValidation,
  });

  assert.equal(validation.allowed, true);
  assert.equal(resolveNextStateFromValidation(passedValidation), "completed");
});

test("blocked transition reply explains current state and next step", () => {
  const message = buildBlockedTransitionReply({
    currentState: "planning",
    attemptedState: "execution",
    validation: {
      allowed: false,
      code: "missing_approved_plan",
      message: "Нельзя начать execution без зафиксированного approved plan snapshot.",
      nextStep: "Сначала согласуйте план, затем дайте понять, что можно начинать.",
    },
  });

  assert.match(message, /Текущее состояние: planning/);
  assert.match(message, /Переход в execution заблокирован/);
  assert.match(message, /Что дальше:/);
});

test("resume continues from the persisted state instead of restarting the workflow", () => {
  assert.equal(
    resolveActionForCurrentState({
      currentState: "planning",
      approvedPlanSnapshot: null,
      executionArtifacts: null,
    }).kind,
    "planning_dialogue"
  );

  assert.equal(
    resolveActionForCurrentState({
      currentState: "execution",
      approvedPlanSnapshot,
      executionArtifacts: null,
    }).kind,
    "execute_approved_plan"
  );

  const producedArtifacts = finalizeExecutionArtifacts(
    createPendingExecutionArtifacts(approvedPlanSnapshot, "2026-03-08T10:02:00.000Z"),
    "Endpoint + tests implemented",
    "2026-03-08T10:03:00.000Z"
  );

  assert.equal(
    resolveActionForCurrentState({
      currentState: "validation",
      approvedPlanSnapshot,
      executionArtifacts: producedArtifacts,
    }).kind,
    "validate_execution_result"
  );
});
