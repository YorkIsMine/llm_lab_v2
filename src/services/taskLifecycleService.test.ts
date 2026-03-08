import assert from "node:assert/strict";
import test from "node:test";
import {
  approvePlanSnapshot,
  createTaskLifecycleSnapshot,
  extractApprovedPlanCandidate,
  presentTaskState,
} from "./taskLifecycleService";

test("restores persisted lifecycle state and snapshots after pause", () => {
  const snapshot = createTaskLifecycleSnapshot({
    id: "session-1",
    agentPhase: "Validation",
    approvedPlanSnapshot: JSON.stringify({
      goal: "Ship the feature",
      plan: ["Implement API", "Add tests"],
      decisions: [],
      constraints: [],
      source: "working_memory_json",
      capturedAt: "2026-03-08T10:00:00.000Z",
      approvedAt: "2026-03-08T10:01:00.000Z",
      approvedByMessage: "Можно начинать.",
    }),
    executionArtifacts: JSON.stringify({
      status: "produced",
      startedAt: "2026-03-08T10:02:00.000Z",
      updatedAt: "2026-03-08T10:03:00.000Z",
      approvedPlanCapturedAt: "2026-03-08T10:00:00.000Z",
      latestOutput: "Done",
    }),
    validationReport: JSON.stringify({
      status: "pending",
      startedAt: "2026-03-08T10:04:00.000Z",
      executionArtifactUpdatedAt: "2026-03-08T10:03:00.000Z",
    }),
  });

  assert.equal(snapshot.currentState, "validation");
  assert.equal(snapshot.approvedPlanSnapshot?.plan[0], "Implement API");
  assert.equal(snapshot.executionArtifacts?.status, "produced");
  assert.equal(snapshot.validationReport?.status, "pending");
});

test("extracts and approves the current plan snapshot from working memory", () => {
  const candidate = extractApprovedPlanCandidate({
    type: "working",
    contentText: "goal: Ship feature\nplan: Implement API; Add tests",
    contentJson: JSON.stringify({
      goal: "Ship feature",
      plan: ["Implement API", "Add tests"],
      decisions: ["Keep the route contract stable"],
      constraints: ["Do not change the public API"],
    }),
    updatedAt: "2026-03-08T10:00:00.000Z",
  });

  assert.ok(candidate);
  assert.equal(candidate?.plan.length, 2);

  const approved = approvePlanSnapshot(candidate!, "С этим планом можно стартовать.", "2026-03-08T10:01:00.000Z");
  assert.equal(approved.approvedByMessage, "С этим планом можно стартовать.");
});

test("session presenter exposes currentState in the API model", () => {
  assert.deepEqual(presentTaskState("execution"), {
    phase: "execution",
    currentState: "execution",
  });
});
