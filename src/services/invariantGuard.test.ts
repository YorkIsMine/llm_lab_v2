import assert from "node:assert/strict";
import test from "node:test";
import { applyInvariantGuard, runInvariantPrecheck } from "./invariantGuard";
import type { Invariant } from "../types/invariant";

const BASE_INVARIANT: Invariant = {
  id: "inv-1",
  title: "No X",
  rule: "Запрещено использовать X",
  scopeType: "user",
  scopeId: "default-user",
  status: "active",
  priority: 100,
  tags: [],
  examplesAllowed: [],
  examplesForbidden: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: "user",
};

test("precheck does not refuse when request is underspecified", () => {
  const result = runInvariantPrecheck({
    userMessage: "Сделай решение",
    invariants: [BASE_INVARIANT],
    enabled: true,
  });

  assert.equal(result.decision.decision, "ALLOW");
  assert.equal(result.content, undefined);
});

test("post-check refuses only when draft really proposes forbidden option", () => {
  const result = applyInvariantGuard({
    userMessage: "Сделай решение с X",
    draftAnswer: "Предлагаю использовать X для этой реализации.",
    invariants: [BASE_INVARIANT],
    enabled: true,
  });

  assert.equal(result.status, "REFUSED");
  assert.deepEqual(result.violatedIds, ["inv-1:c1"]);
  assert.match(result.content, /Invariant check: REFUSED \(violates: inv-1:c1\)/);
});

test("post-check keeps allowed answer when proposal uses different option", () => {
  const result = applyInvariantGuard({
    userMessage: "Сделай решение с Y",
    draftAnswer: "Предлагаю использовать Y для этой реализации.",
    invariants: [BASE_INVARIANT],
    enabled: true,
  });

  assert.equal(result.status, "OK");
  assert.deepEqual(result.violatedIds, []);
  assert.match(result.content, /Invariant check: OK$/);
});

test("post-check does not refuse java when only python is forbidden", () => {
  const result = applyInvariantGuard({
    userMessage: "Сделай код на джаве",
    draftAnswer: "Предлагаю реализацию на Java с Spring Boot.",
    invariants: [
      {
        ...BASE_INVARIANT,
        rule: "Не писать код на пайтон",
        title: "No Python",
      },
    ],
    enabled: true,
  });

  assert.equal(result.status, "OK");
  assert.deepEqual(result.violatedIds, []);
  assert.match(result.content, /Invariant check: OK$/);
});
