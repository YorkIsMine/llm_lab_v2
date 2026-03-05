import assert from "node:assert/strict";
import test from "node:test";
import {
  hasTaskContext,
  isDoneCommand,
  isProceedCommand,
  resolvePhaseForUserMessage,
  transitionAfterExecution,
  transitionAfterValidation,
} from "./agentPhaseMachine";

test("isProceedCommand detects required keyword with case and punctuation", () => {
  assert.equal(isProceedCommand("приступай"), true);
  assert.equal(isProceedCommand("Приступай!"), true);
  assert.equal(isProceedCommand("приступай."), true);
  assert.equal(isProceedCommand("начинай!!!"), true);
  assert.equal(isProceedCommand("go ahead"), true);
});

test("isProceedCommand does not trigger on non-command text", () => {
  assert.equal(isProceedCommand("не приступай"), false);
  assert.equal(isProceedCommand("приступай к задаче"), false);
  assert.equal(isProceedCommand("сделай это"), false);
});

test("isDoneCommand detects completion command with case and punctuation", () => {
  assert.equal(isDoneCommand("готово"), true);
  assert.equal(isDoneCommand("Готово!"), true);
  assert.equal(isDoneCommand("готово."), true);
  assert.equal(isDoneCommand("done"), true);
  assert.equal(isDoneCommand("почти готово"), false);
});

test("hasTaskContext requires latest user message to be a real task message", () => {
  assert.equal(hasTaskContext([]), false);
  assert.equal(hasTaskContext(["приступай"]), false);
  assert.equal(hasTaskContext(["Сделай кнопку в шапке"]), true);
  assert.equal(hasTaskContext(["Сделай кнопку в шапке", "приступай"]), false);
});

test("resolvePhaseForUserMessage transitions are deterministic", () => {
  assert.equal(
    resolvePhaseForUserMessage({
      currentPhase: "Planning",
      userText: "приступай!",
      hasTaskContext: true,
    }),
    "Execution"
  );

  assert.equal(
    resolvePhaseForUserMessage({
      currentPhase: "Planning",
      userText: "приступай!",
      hasTaskContext: false,
    }),
    "Planning"
  );

  assert.equal(
    resolvePhaseForUserMessage({
      currentPhase: "Done",
      userText: "Сделай новый API endpoint",
      hasTaskContext: true,
    }),
    "Planning"
  );

  assert.equal(
    resolvePhaseForUserMessage({
      currentPhase: "Execution",
      userText: "Готово!",
      hasTaskContext: true,
    }),
    "Done"
  );

  assert.equal(
    resolvePhaseForUserMessage({
      currentPhase: "Validation",
      userText: "готово.",
      hasTaskContext: true,
    }),
    "Done"
  );
});

test("execution and validation transitions", () => {
  assert.equal(transitionAfterExecution(), "Validation");
  assert.equal(transitionAfterValidation(true), "Done");
  assert.equal(transitionAfterValidation(false), "Execution");
});
