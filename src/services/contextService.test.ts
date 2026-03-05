import assert from "node:assert/strict";
import test from "node:test";
import { composeContextMessages } from "./contextService";

test("invariants are injected as separate system block and not mixed into dialogue history", () => {
  const messages = composeContextMessages({
    phase: "Planning",
    shortMemory: {
      type: "short",
      description: "Last 10 messages",
      messages: [
        { role: "user", content: "Сделай endpoint", createdAt: new Date().toISOString() },
        { role: "assistant", content: "Нужны уточнения", createdAt: new Date().toISOString() },
      ],
    },
    workingMemory: null,
    longTermMemory: [],
    invariantContext: {
      enabled: true,
      invariants: [
        {
          id: "inv-100",
          title: "PII",
          rule: "Нельзя показывать PII",
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
        },
      ],
      constraints: [
        {
          id: "inv-100:c1",
          invariantId: "inv-100",
          title: "PII",
          kind: "FORBID",
          subject: "data_handling",
          predicate: { field: "store_pii", operator: "BOOLEAN", value: false },
          scopeType: "user",
          scopeId: "default-user",
          priority: 100,
          originalText: "Нельзя показывать PII",
        },
      ],
      requestProposal: {
        intent: "general_solution",
        summary: "intent=general_solution",
        technologiesUsed: [],
        rejectedChoices: [],
        operations: [],
        architectureChoices: [],
        dataHandling: [],
        securityActions: [],
        integrationChoices: [],
        deploymentChoices: [],
        uiBehaviors: [],
        businessActions: [],
        entities: [],
      },
      preGenerationDecision: {
        decision: "ALLOW",
        violatedConstraints: [],
        relevantConstraints: ["inv-100:c1"],
        rationaleShort: "Активные ограничения не конфликтуют с текущим предложением.",
        safeAlternatives: [],
      },
    },
  });

  assert.equal(messages[0].role, "system");
  assert.match(String(messages[0].content), /INVARIANTS \(non-negotiable\)/);
  assert.match(String(messages[0].content), /NORMALIZED CONSTRAINTS/);
  assert.match(String(messages[0].content), /\[inv-100:c1\]/);
  assert.match(String(messages[0].content), /\[inv-100\]/);

  const historyMessages = messages.slice(1);
  assert.equal(historyMessages.length, 2);
  assert.equal(historyMessages[0].content, "Сделай endpoint");
  assert.equal(historyMessages[1].content, "Нужны уточнения");
  assert.ok(!String(historyMessages[0].content).includes("inv-100"));
  assert.ok(!String(historyMessages[1].content).includes("INVARIANTS"));
});
