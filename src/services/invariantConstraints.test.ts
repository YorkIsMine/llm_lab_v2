import assert from "node:assert/strict";
import test from "node:test";
import { evaluateConstraints, extractProposal, normalizeInvariants } from "./invariantConstraints";

test("FORBID specific X does not block different Y", () => {
  const constraints = normalizeInvariants(["запрещено использовать X"]);
  const proposal = extractProposal("Сделай решение с Y");
  const decision = evaluateConstraints(constraints, proposal);

  assert.equal(decision.decision, "ALLOW");
  assert.deepEqual(decision.violatedConstraints, []);
});

test("FORBID specific X refuses only when proposal contains X", () => {
  const constraints = normalizeInvariants(["запрещено использовать X"]);
  const proposal = extractProposal("Сделай решение с X");
  const decision = evaluateConstraints(constraints, proposal);

  assert.equal(decision.decision, "REFUSE");
  assert.deepEqual(decision.violatedConstraints, ["raw-invariant-1:c1"]);
});

test("REQUIRE specific architecture refuses incompatible choice", () => {
  const constraints = normalizeInvariants(["архитектура должна быть монолит"]);
  const proposal = extractProposal("Сделай архитектуру microservices");
  const decision = evaluateConstraints(constraints, proposal);

  assert.equal(decision.decision, "REFUSE");
  assert.deepEqual(decision.violatedConstraints, ["raw-invariant-1:c1"]);
});

test("underspecified request does not refuse by default", () => {
  const constraints = normalizeInvariants(["запрещено использовать X"]);
  const proposal = extractProposal("Сделай решение");
  const decision = evaluateConstraints(constraints, proposal);

  assert.equal(decision.decision, "ALLOW");
  assert.deepEqual(decision.violatedConstraints, []);
});

test("forbid python does not block java request", () => {
  const constraints = normalizeInvariants(["не писать код на пайтон"]);
  const proposal = extractProposal("Сделай код на джаве");
  const decision = evaluateConstraints(constraints, proposal);

  assert.equal(decision.decision, "ALLOW");
  assert.deepEqual(decision.violatedConstraints, []);
});

test("business/data rule forbids storing raw PII but allows tokenized reference", () => {
  const constraints = normalizeInvariants(["нельзя хранить PII"]);

  const rawPiiProposal = extractProposal("Сохраняй паспортные данные в БД");
  const rawPiiDecision = evaluateConstraints(constraints, rawPiiProposal);
  assert.equal(rawPiiDecision.decision, "REFUSE");

  const safeProposal = extractProposal("Сохраняй только хеш/токен без PII");
  const safeDecision = evaluateConstraints(constraints, safeProposal);
  assert.equal(safeDecision.decision, "ALLOW");
});
