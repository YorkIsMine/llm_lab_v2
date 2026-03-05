export const INVARIANT_SCOPES = ["user", "workspace", "global"] as const;
export type InvariantScope = (typeof INVARIANT_SCOPES)[number];

export const INVARIANT_STATUSES = ["active", "archived"] as const;
export type InvariantStatus = (typeof INVARIANT_STATUSES)[number];

export const CONSTRAINT_KINDS = ["FORBID", "REQUIRE", "LIMIT", "ALWAYS"] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

export const CONSTRAINT_SUBJECTS = [
  "technology",
  "language",
  "framework",
  "database",
  "architecture",
  "deployment",
  "data_handling",
  "security",
  "business_rule",
  "integration",
  "ui_behavior",
  "ops",
  "general",
] as const;
export type ConstraintSubject = (typeof CONSTRAINT_SUBJECTS)[number];

export const CONSTRAINT_OPERATORS = ["IN", "NOT_IN", "EQUALS", "CONTAINS", "REGEX", "BOOLEAN"] as const;
export type ConstraintOperator = (typeof CONSTRAINT_OPERATORS)[number];

export const GUARD_DECISIONS = ["ALLOW", "REFUSE"] as const;
export type GuardDecisionType = (typeof GUARD_DECISIONS)[number];

export interface InvariantScopeContext {
  scopeType: InvariantScope;
  scopeId?: string | null;
  includeGlobal?: boolean;
}

export interface Invariant {
  id: string;
  title: string;
  rule: string;
  scopeType: InvariantScope;
  scopeId: string | null;
  status: InvariantStatus;
  priority: number;
  tags: string[];
  examplesAllowed: string[];
  examplesForbidden: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface InvariantCreatePayload {
  title: string;
  rule: string;
  status?: InvariantStatus;
  priority?: number;
  tags?: string[];
  examplesAllowed?: string[];
  examplesForbidden?: string[];
  createdBy?: string | null;
}

export interface InvariantUpdatePayload {
  title?: string;
  rule?: string;
  status?: InvariantStatus;
  priority?: number;
  tags?: string[];
  examplesAllowed?: string[];
  examplesForbidden?: string[];
}

export interface InvariantValidationResult {
  title: string;
  rule: string;
  status: InvariantStatus;
  priority: number;
  tags: string[];
  examplesAllowed: string[];
  examplesForbidden: string[];
  createdBy: string | null;
}

export interface ConstraintPredicate {
  field: string;
  operator: ConstraintOperator;
  value: string | string[] | boolean;
}

export interface Constraint {
  id: string;
  invariantId: string;
  title: string;
  kind: ConstraintKind;
  subject: ConstraintSubject;
  predicate: ConstraintPredicate;
  scopeType: InvariantScope;
  scopeId: string | null;
  priority: number;
  originalText: string;
}

export const PROPOSAL_INTENTS = [
  "general_solution",
  "code_generation",
  "architecture_design",
  "data_change",
  "integration_change",
  "ops_change",
  "security_change",
  "ui_change",
  "business_change",
  "analysis",
  "instructions",
] as const;
export type ProposalIntent = (typeof PROPOSAL_INTENTS)[number];

export interface ProposalExtraction {
  intent: ProposalIntent;
  summary: string;
  technologiesUsed: string[];
  rejectedChoices: string[];
  operations: string[];
  architectureChoices: string[];
  dataHandling: string[];
  securityActions: string[];
  integrationChoices: string[];
  deploymentChoices: string[];
  uiBehaviors: string[];
  businessActions: string[];
  entities: string[];
}

export interface GuardDecision {
  decision: GuardDecisionType;
  violatedConstraints: string[];
  relevantConstraints: string[];
  rationaleShort: string;
  safeAlternatives: string[];
}

export const DEFAULT_INVARIANT_SCOPE_CONTEXT: InvariantScopeContext = {
  scopeType: "user",
  scopeId: "default-user",
  includeGlobal: true,
};

export const INVARIANTS_ENABLED_SETTING_PREFIX = "invariants.enabled";
