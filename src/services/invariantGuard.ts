import type { Constraint, GuardDecision, Invariant, ProposalExtraction } from "@/types/invariant";
import {
  buildSafeAlternatives,
  evaluateConstraints,
  extractProposal,
  normalizeInvariants,
} from "./invariantConstraints";

export interface InvariantPrecheckOptions {
  userMessage: string;
  invariants: Invariant[];
  enabled: boolean;
}

export interface InvariantPrecheckResult {
  constraints: Constraint[];
  proposal: ProposalExtraction;
  decision: GuardDecision;
  content?: string;
}

export interface InvariantGuardOptions {
  userMessage: string;
  draftAnswer: string;
  invariants: Invariant[];
  enabled: boolean;
}

export interface InvariantGuardResult {
  content: string;
  status: "OK" | "REFUSED";
  violatedIds: string[];
  refused: boolean;
  repairTriggered: boolean;
  constraints: Constraint[];
  proposal: ProposalExtraction;
  decision: GuardDecision;
}

const CHECK_LINE_REGEX = /\n?Invariant check:\s*(?:OK|REFUSED)(?:\s*\(violates:\s*[^)]*\))?\s*$/i;

function toCheckStatus(decision: GuardDecision["decision"]): "OK" | "REFUSED" {
  if (decision === "ALLOW") return "OK";
  return "REFUSED";
}

export function ensureInvariantCheck(
  content: string,
  status: "OK" | "REFUSED",
  violatedIds: string[] = []
): string {
  const withoutPrevious = content.replace(CHECK_LINE_REGEX, "").trim();
  if (status === "OK") {
    return `${withoutPrevious}\n\nInvariant check: OK`;
  }
  const ids = violatedIds.length > 0 ? violatedIds.join(", ") : "unknown";
  return `${withoutPrevious}\n\nInvariant check: REFUSED (violates: ${ids})`;
}

function filterConstraintsByIds(constraints: Constraint[], ids: string[]): Constraint[] {
  return constraints.filter((constraint) => ids.includes(constraint.id));
}

function renderConstraintList(constraints: Constraint[]): string {
  return constraints
    .map((constraint) => `- [${constraint.id}] ${constraint.title}: ${constraint.originalText}`)
    .join("\n");
}

function buildRefusalContent(decision: GuardDecision, constraints: Constraint[]): string {
  const violated = filterConstraintsByIds(constraints, decision.violatedConstraints);
  const alternatives = decision.safeAlternatives.length > 0 ? decision.safeAlternatives : buildSafeAlternatives(violated);

  return ensureInvariantCheck(
    [
      "Не могу предложить этот путь: он нарушает активные ограничения.",
      "",
      "Конфликтующие ограничения:",
      renderConstraintList(violated),
      "",
      `Почему: ${decision.rationaleShort}`,
      "",
      "Безопасные альтернативы:",
      alternatives.slice(0, 3).map((item, index) => `${index + 1}. ${item}`).join("\n"),
      "",
      "Если нужен другой путь, сначала явно измените соответствующие инварианты через UI или команду /invariants edit.",
    ].join("\n"),
    "REFUSED",
    decision.violatedConstraints
  );
}

export function runInvariantPrecheck(options: InvariantPrecheckOptions): InvariantPrecheckResult {
  const constraints = options.enabled ? normalizeInvariants(options.invariants) : [];
  const proposal = extractProposal(options.userMessage);
  const decision = options.enabled ? evaluateConstraints(constraints, proposal) : {
    decision: "ALLOW" as const,
    violatedConstraints: [],
    relevantConstraints: [],
    rationaleShort: "Инварианты отключены.",
    safeAlternatives: [],
  };

  if (!options.enabled || constraints.length === 0 || decision.decision === "ALLOW") {
    return { constraints, proposal, decision };
  }

  return {
    constraints,
    proposal,
    decision,
    content: buildRefusalContent(decision, constraints),
  };
}

export function applyInvariantGuard(options: InvariantGuardOptions): InvariantGuardResult {
  const constraints = options.enabled ? normalizeInvariants(options.invariants) : [];
  const proposal = extractProposal(options.userMessage, { candidateText: options.draftAnswer });
  const decision = options.enabled ? evaluateConstraints(constraints, proposal) : {
    decision: "ALLOW" as const,
    violatedConstraints: [],
    relevantConstraints: [],
    rationaleShort: "Инварианты отключены.",
    safeAlternatives: [],
  };

  const status = toCheckStatus(decision.decision);
  if (!options.enabled || constraints.length === 0 || decision.decision === "ALLOW") {
    return {
      content: ensureInvariantCheck(options.draftAnswer, "OK"),
      status: "OK",
      violatedIds: [],
      refused: false,
      repairTriggered: false,
      constraints,
      proposal,
      decision,
    };
  }

  const content =
    buildRefusalContent(decision, constraints);

  return {
    content,
    status,
    violatedIds: decision.violatedConstraints,
    refused: decision.decision === "REFUSE",
    repairTriggered: true,
    constraints,
    proposal,
    decision,
  };
}
