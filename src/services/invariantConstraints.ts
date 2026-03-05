import type {
  Constraint,
  ConstraintKind,
  ConstraintPredicate,
  ConstraintSubject,
  GuardDecision,
  Invariant,
  ProposalExtraction,
  ProposalIntent,
} from "@/types/invariant";

type RawInvariantInput = Invariant | string;

interface ProposalContext {
  candidateText?: string;
}

interface SubjectEvidence {
  relevant: boolean;
  specified: boolean;
  positive: string[];
  negative: string[];
}

const KNOWN_LANGUAGES = ["typescript", "javascript", "python", "java", "go", "rust", "ruby", "php", "kotlin", "swift", "c#"];
const KNOWN_FRAMEWORKS = [
  "next.js",
  "next",
  "react",
  "vue",
  "angular",
  "nestjs",
  "express",
  "fastapi",
  "django",
  "flask",
  "spring",
  "laravel",
];
const KNOWN_DATABASES = ["postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis", "clickhouse", "elasticsearch"];
const KNOWN_ARCHITECTURES = ["monolith", "microservices", "ddd", "event-driven", "modular-monolith", "hexagonal"];
const KNOWN_DEPLOYMENTS = ["kubernetes", "docker", "serverless", "vercel", "aws", "gcp", "azure", "on-prem"];
const KNOWN_INTEGRATIONS = ["gateway", "api-gateway", "webhook", "queue", "broker", "direct"];
const CHOICE_ALIASES: Record<string, string> = {
  python: "python",
  питон: "python",
  пайтон: "python",
  java: "java",
  java8: "java",
  java17: "java",
  джава: "java",
  джаве: "java",
  жава: "java",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  nextjs: "next.js",
  "next.js": "next.js",
  react: "react",
  vue: "vue",
  angular: "angular",
  nest: "nestjs",
  nestjs: "nestjs",
};
const LANGUAGE_TERMS = unique([...KNOWN_LANGUAGES, ...Object.keys(CHOICE_ALIASES)]);
const ALL_KNOWN_CHOICES = unique([
  ...KNOWN_LANGUAGES,
  ...KNOWN_FRAMEWORKS,
  ...KNOWN_DATABASES,
  ...KNOWN_ARCHITECTURES,
  ...KNOWN_DEPLOYMENTS,
  ...KNOWN_INTEGRATIONS,
  ...Object.keys(CHOICE_ALIASES),
  ...Object.values(CHOICE_ALIASES),
]).map(canonicalizeChoice);
const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "под",
  "для",
  "the",
  "a",
  "an",
  "to",
  "of",
  "prod",
  "production",
  "бд",
  "db",
  "api",
  "ui",
  "ux",
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[«»"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsAny(text: string, patterns: Array<string | RegExp>): boolean {
  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return text.includes(pattern);
    }
    return pattern.test(text);
  });
}

function canonicalizeChoice(token: string): string {
  const normalized = normalizeText(token).replace(/[.,:;!?()]/g, "").trim();
  if (!normalized) return "";
  if (normalized in CHOICE_ALIASES) {
    return CHOICE_ALIASES[normalized];
  }
  if (normalized === "postgresql") return "postgres";
  if (normalized === "монолит") return "monolith";
  if (normalized === "микросервисы" || normalized === "микросервис") return "microservices";
  if (normalized === "api gateway") return "gateway";
  if (normalized === "dark pattern" || normalized === "dark patterns") return "dark-patterns";
  if (normalized === "read only" || normalized === "readonly" || normalized === "read-only") return "read-only";
  return normalized;
}

function invariantToRawEntry(raw: RawInvariantInput, index: number): Invariant {
  if (typeof raw !== "string") {
    return raw;
  }

  const id = `raw-invariant-${index + 1}`;
  return {
    id,
    title: raw.slice(0, 48) || id,
    rule: raw,
    scopeType: "user",
    scopeId: "default-user",
    status: "active",
    priority: 100,
    tags: [],
    examplesAllowed: [],
    examplesForbidden: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    createdBy: null,
  };
}

function inferConstraintKind(text: string): ConstraintKind {
  if (containsAny(text, ["всегда", "always", "обязательно"])) {
    return "ALWAYS";
  }
  if (containsAny(text, ["нельзя", "запрещено", "never", "must not", "do not", "не использовать", "никогда"])) {
    return "FORBID";
  }
  if (containsAny(text, ["только", "only", "должно", "должен", "должна", "must be"])) {
    return "REQUIRE";
  }
  if (containsAny(text, ["не более", "до ", "max ", "лимит", "limit"])) {
    return "LIMIT";
  }
  return "ALWAYS";
}

function inferConstraintSubject(text: string): ConstraintSubject {
  if (containsAny(text, ["pii", "персональ", "паспорт", "email", "телефон", "логировать", "хранить", "сохранять"])) {
    return "data_handling";
  }
  if (containsAny(text, ["auth", "rbac", "encrypt", "шифр", "secret", "prod access", "read-only", "readonly"])) {
    return "security";
  }
  if (containsAny(text, ["gateway", "api gateway", "webhook", "broker", "queue", "integration", "интеграц"])) {
    return "integration";
  }
  if (containsAny(text, ["монолит", "monolith", "микросервис", "microservice", "ddd", "hexagonal", "event-driven"])) {
    return "architecture";
  }
  if (containsAny(text, ["kubernetes", "docker", "serverless", "deploy", "деплой", "prod", "production", "read-only доступ"])) {
    return "ops";
  }
  if (containsAny(text, ["ux", "ui", "dark pattern", "обманн", "манипулятив"])) {
    return "ui_behavior";
  }
  if (containsAny(text, ["оплата", "payment", "price", "цена", "refund", "rounding", "подтвержден"])) {
    return "business_rule";
  }
  if (containsAny(text, LANGUAGE_TERMS)) {
    return "language";
  }
  if (containsAny(text, KNOWN_FRAMEWORKS)) {
    return "framework";
  }
  if (containsAny(text, KNOWN_DATABASES)) {
    return "database";
  }
  if (containsAny(text, ["использовать", "use", "using"])) {
    return "technology";
  }
  if (containsAny(text, ["язык", "framework", "database", "база данных", "стек", "технолог"])) {
    return "technology";
  }
  return "general";
}

function extractNamedChoice(text: string): string {
  const patterns = [
    /(?:использовать|используем|используя|use|using|with)\s+([a-zа-яё0-9._#+-]+)/i,
    /(?:должно быть|должен быть|должна быть|only|только|be)\s+([a-zа-яё0-9._#+-]+)/i,
    /(?:через|via)\s+([a-zа-яё0-9._#+-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return canonicalizeChoice(match[1]);
    }
  }

  const tokens = text.match(/[a-zа-яё0-9._#+-]+/gi) ?? [];
  const filtered = tokens
    .map((token) => canonicalizeChoice(token))
    .filter((token) => token && !STOP_WORDS.has(token));
  return filtered[filtered.length - 1] ?? "";
}

function inferPredicate(text: string, subject: ConstraintSubject, kind: ConstraintKind): ConstraintPredicate {
  if (subject === "data_handling" && containsAny(text, ["pii", "персональ", "паспорт", "email", "телефон"])) {
    return { field: "store_pii", operator: "BOOLEAN", value: kind === "FORBID" ? false : true };
  }
  if (subject === "security" && containsAny(text, ["read-only", "readonly", "только read-only", "только чтение"])) {
    return { field: "prod_write_access", operator: "BOOLEAN", value: false };
  }
  if (subject === "ops" && containsAny(text, ["read-only", "readonly", "только чтение"])) {
    return { field: "prod_write_access", operator: "BOOLEAN", value: false };
  }
  if (subject === "integration" && containsAny(text, ["gateway", "api gateway", "шлюз"])) {
    return { field: "via_gateway", operator: "BOOLEAN", value: kind === "FORBID" ? false : true };
  }
  if (subject === "ui_behavior" && containsAny(text, ["dark pattern", "обманн", "манипулятив"])) {
    return { field: "no_dark_patterns", operator: "BOOLEAN", value: true };
  }
  if (subject === "architecture" && containsAny(text, ["монолит", "monolith"])) {
    return { field: "architecture_style", operator: "EQUALS", value: "monolith" };
  }
  if (subject === "architecture" && containsAny(text, ["микросервис", "microservice"])) {
    return { field: "architecture_style", operator: "EQUALS", value: "microservices" };
  }

  const choice = extractNamedChoice(text);
  return {
    field: subject === "general" ? "value" : subject,
    operator: kind === "REQUIRE" || kind === "LIMIT" ? "EQUALS" : "CONTAINS",
    value: choice || text,
  };
}

export function normalizeInvariants(rawInvariants: RawInvariantInput[]): Constraint[] {
  return rawInvariants.map((rawInvariant, index) => {
    const invariant = invariantToRawEntry(rawInvariant, index);
    const normalizedRule = normalizeText(invariant.rule);
    const kind = inferConstraintKind(normalizedRule);
    const subject = inferConstraintSubject(normalizedRule);
    const predicate = inferPredicate(normalizedRule, subject, kind);

    return {
      id: `${invariant.id}:c1`,
      invariantId: invariant.id,
      title: invariant.title,
      kind,
      subject,
      predicate,
      scopeType: invariant.scopeType,
      scopeId: invariant.scopeId,
      priority: invariant.priority,
      originalText: invariant.rule,
    };
  });
}

function inferIntent(text: string): ProposalIntent {
  const normalized = normalizeText(text);
  if (containsAny(normalized, ["объясни", "почему", "сравни", "что такое", "расскажи"])) {
    return "analysis";
  }
  if (containsAny(normalized, ["как ", "инструкц", "шаги", "настрой"])) {
    return "instructions";
  }
  if (containsAny(normalized, ["архитектур", "монолит", "микросервис", "system design"])) {
    return "architecture_design";
  }
  if (containsAny(normalized, ["бд", "database", "сохраня", "хран", "данные", "паспорт", "pii"])) {
    return "data_change";
  }
  if (containsAny(normalized, ["gateway", "интеграц", "webhook", "broker"])) {
    return "integration_change";
  }
  if (containsAny(normalized, ["prod", "production", "deploy", "деплой", "доступ"])) {
    return "ops_change";
  }
  if (containsAny(normalized, ["auth", "шифр", "secret", "rbac", "security"])) {
    return "security_change";
  }
  if (containsAny(normalized, ["ui", "ux", "интерфейс", "экран", "dark pattern"])) {
    return "ui_change";
  }
  if (containsAny(normalized, ["оплата", "payment", "цена", "refund", "checkout"])) {
    return "business_change";
  }
  if (containsAny(normalized, ["код", "endpoint", "api", "component", "реализуй", "напиши", "сделай"])) {
    return "code_generation";
  }
  return "general_solution";
}

function hasNegatedValue(text: string, value: string): boolean {
  const escaped = escapeRegExp(value);
  const patterns = [
    new RegExp(`(?:не|без|вместо|instead of)\\s+(?:на\\s+)?${escaped}`),
    new RegExp(`(?:не использовать|avoid|exclude)\\s+(?:на\\s+)?${escaped}`),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function isKnownChoice(token: string): boolean {
  const canonical = canonicalizeChoice(token);
  return Boolean(canonical) && ALL_KNOWN_CHOICES.includes(canonical);
}

function collectPositiveChoices(text: string): string[] {
  const matches: string[] = [];
  const patterns = [
    /(?:решени[ея]|вариант|код|solution|stack)\s+с\s+([a-zа-яё0-9._#+-]+)/gi,
    /(?:использ(?:уем|овать|уя)|use|using|with|выбер(?:ем|ите)|бер(?:ем|ем)|choose)\s+([a-zа-яё0-9._#+-]+)/gi,
    /(?:архитектур[аы]|architecture)\s*(?:=|:|должна быть|should be)?\s*([a-zа-яё0-9._#+-]+)/gi,
    /(?:через|via)\s+([a-zа-яё0-9._#+-]+)/gi,
    /(?:напиши|сделай|реализуй|build|implement|write)[^.!?\n]{0,60}?\bна\s+([a-zа-яё0-9._#+-]+)/gi,
    /(?:код|сервис|проект|app|service|backend|frontend|api)[^.!?\n]{0,20}?\bна\s+([a-zа-яё0-9._#+-]+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) {
      const token = canonicalizeChoice(match[1]);
      if (token && !hasNegatedValue(text, token)) {
        matches.push(token);
      }
    }
  }

  const onLanguagePattern = /\bна\s+([a-zа-яё0-9._#+-]+)/gi;
  let onLanguageMatch: RegExpExecArray | null = null;
  while ((onLanguageMatch = onLanguagePattern.exec(text)) !== null) {
    const token = canonicalizeChoice(onLanguageMatch[1]);
    if (token && isKnownChoice(token) && !hasNegatedValue(text, token)) {
      matches.push(token);
    }
  }
  return unique(matches);
}

function collectRejectedChoices(text: string): string[] {
  const matches: string[] = [];
  const patterns = [
    /(?:не|без|вместо|instead of)\s+(?:на\s+)?([a-zа-яё0-9._#+-]+)/gi,
    /(?:не использовать|avoid|exclude|forbid)\s+(?:на\s+)?([a-zа-яё0-9._#+-]+)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(text)) !== null) {
      const token = canonicalizeChoice(match[1]);
      if (token) {
        matches.push(token);
      }
    }
  }
  return unique(matches);
}

function collectKnownMatches(text: string, choices: string[]): string[] {
  return unique(
    choices.filter((choice) => {
      const normalizedChoice = escapeRegExp(choice).replace(/\\-/g, "[ -]?");
      return new RegExp(`\\b${normalizedChoice}\\b`).test(text) && !hasNegatedValue(text, choice);
    })
  );
}

function detectStorePiiRisk(text: string): boolean {
  const hasStoreAction = containsAny(text, ["хран", "сохраня", "store", "persist", "записы"]);
  const hasPii = containsAny(text, ["pii", "персональ", "паспорт", "email", "телефон"]);
  const safeMasking = containsAny(text, ["без pii", "without pii", "hash", "хеш", "token", "токен", "маск", "аноним"]);
  const explicitNegation = containsAny(text, ["не хранить pii", "не сохранять pii", "без хранения pii"]);
  return hasStoreAction && hasPii && !safeMasking && !explicitNegation;
}

function detectTokenizedStorage(text: string): boolean {
  const hasStoreAction = containsAny(text, ["хран", "сохраня", "store", "persist", "записы"]);
  const safeMasking = containsAny(text, ["hash", "хеш", "token", "токен", "маск", "аноним"]);
  return hasStoreAction && safeMasking;
}

function detectProdWrite(text: string): boolean {
  return containsAny(text, ["prod", "production", "прод"]) && containsAny(text, ["write", "измен", "удал", "delete", "deploy"]);
}

function detectProdReadOnly(text: string): boolean {
  return containsAny(text, ["prod", "production", "прод"]) && containsAny(text, ["read-only", "readonly", "только чтение", "read only"]);
}

function detectPaymentBeforeConfirmation(text: string): boolean {
  return containsAny(text, ["payment", "оплата"]) && containsAny(text, ["before confirmation", "до подтвержден", "before approve"]);
}

export function extractProposal(requestText: string, context: ProposalContext = {}): ProposalExtraction {
  const request = normalizeText(requestText);
  const candidate = normalizeText(context.candidateText ?? "");
  const combined = [request, candidate].filter(Boolean).join(" ");
  const positiveChoices = unique([...collectPositiveChoices(request), ...collectPositiveChoices(candidate)]);
  const rejectedChoices = unique([...collectRejectedChoices(request), ...collectRejectedChoices(candidate)]);
  const architectureChoices = unique([
    ...collectKnownMatches(combined, KNOWN_ARCHITECTURES),
    ...positiveChoices.filter((choice) => KNOWN_ARCHITECTURES.includes(choice)),
  ]);
  const integrationChoices = unique([
    ...collectKnownMatches(combined, KNOWN_INTEGRATIONS),
    ...positiveChoices.filter((choice) => KNOWN_INTEGRATIONS.includes(choice)),
  ]);
  const deploymentChoices = unique([
    ...collectKnownMatches(combined, KNOWN_DEPLOYMENTS),
    ...positiveChoices.filter((choice) => KNOWN_DEPLOYMENTS.includes(choice)),
  ]);
  const uiBehaviors = unique(
    containsAny(combined, ["dark pattern", "обманн", "манипулятив"]) && !containsAny(combined, ["без dark pattern", "without dark pattern", "no dark patterns"])
      ? ["dark-patterns"]
      : []
  );
  const technologiesUsed = unique(
    positiveChoices.filter(
      (choice) =>
        !KNOWN_ARCHITECTURES.includes(choice) && !KNOWN_INTEGRATIONS.includes(choice) && !KNOWN_DEPLOYMENTS.includes(choice)
    )
  );

  const operations: string[] = [];
  const dataHandling: string[] = [];
  const securityActions: string[] = [];
  const businessActions: string[] = [];
  const entities: string[] = [];

  if (detectStorePiiRisk(combined)) {
    operations.push("store_pii");
    dataHandling.push("store_pii");
    entities.push("pii");
  } else if (detectTokenizedStorage(combined)) {
    operations.push("store_tokenized_reference");
    dataHandling.push("tokenize_sensitive_data");
  } else if (containsAny(combined, ["хран", "сохраня", "store", "persist", "записы"])) {
    operations.push("store_data");
    dataHandling.push("store_data");
  }

  if (containsAny(combined, ["delete data", "удал", "delete"])) {
    operations.push("delete_data");
    dataHandling.push("delete_data");
  }
  if (containsAny(combined, ["share", "передав", "export"])) {
    operations.push("share_data");
    dataHandling.push("share_data");
  }
  if (detectProdWrite(combined)) {
    operations.push("write_prod");
    securityActions.push("prod_write_access");
  }
  if (detectProdReadOnly(combined)) {
    operations.push("read_only_prod");
    securityActions.push("prod_read_only_access");
  }
  if (containsAny(combined, ["encrypt", "шифр"])) {
    securityActions.push("encryption");
  }
  if (containsAny(combined, ["auth", "oauth", "rbac", "login", "аутент", "авториз"])) {
    securityActions.push("auth");
  }
  if (containsAny(combined, ["secret", "secrets", "token", "ключ"])) {
    securityActions.push("secrets");
  }
  if (containsAny(combined, ["gateway", "api gateway", "шлюз"])) {
    operations.push("integrate_via_gateway");
  }
  if (containsAny(combined, ["direct integration", "прямую интеграц", "напрямую"])) {
    operations.push("direct_integration");
  }
  if (detectPaymentBeforeConfirmation(combined)) {
    operations.push("payments_flow_change");
    businessActions.push("charge_before_confirmation");
  }
  if (containsAny(combined, ["после подтвержден", "after confirmation"])) {
    businessActions.push("charge_after_confirmation");
  }
  if (containsAny(combined, ["price", "цена", "round"])) {
    businessActions.push("pricing_change");
  }

  if (containsAny(combined, ["pii", "персональ", "паспорт", "email", "телефон"])) {
    entities.push("pii");
  }

  const intent = inferIntent(request);
  const summaryParts = [
    `intent=${intent}`,
    technologiesUsed.length > 0 ? `technologies=${technologiesUsed.join(",")}` : "",
    architectureChoices.length > 0 ? `architecture=${architectureChoices.join(",")}` : "",
    operations.length > 0 ? `operations=${operations.join(",")}` : "",
  ].filter(Boolean);

  return {
    intent,
    summary: summaryParts.join("; "),
    technologiesUsed,
    rejectedChoices,
    operations: unique(operations),
    architectureChoices,
    dataHandling: unique(dataHandling),
    securityActions: unique(securityActions),
    integrationChoices,
    deploymentChoices,
    uiBehaviors,
    businessActions: unique(businessActions),
    entities: unique(entities),
  };
}

function getConstraintValueAsStrings(predicate: ConstraintPredicate): string[] {
  if (Array.isArray(predicate.value)) {
    return predicate.value.map((item) => canonicalizeChoice(String(item)));
  }
  if (typeof predicate.value === "boolean") {
    return [String(predicate.value)];
  }
  return [canonicalizeChoice(predicate.value)];
}

function getBooleanFieldValue(field: string, proposal: ProposalExtraction): boolean | null {
  if (field === "store_pii") {
    if (proposal.operations.includes("store_pii")) return true;
    if (proposal.operations.includes("store_tokenized_reference")) return false;
    if (proposal.operations.includes("store_data") && proposal.entities.includes("pii")) return true;
    return proposal.operations.includes("store_data") ? null : false;
  }
  if (field === "prod_write_access") {
    if (proposal.operations.includes("write_prod")) return true;
    if (proposal.operations.includes("read_only_prod")) return false;
    return null;
  }
  if (field === "via_gateway") {
    if (proposal.integrationChoices.includes("gateway") || proposal.operations.includes("integrate_via_gateway")) return true;
    if (proposal.integrationChoices.includes("direct") || proposal.operations.includes("direct_integration")) return false;
    return null;
  }
  if (field === "no_dark_patterns") {
    return !proposal.uiBehaviors.includes("dark-patterns");
  }
  return null;
}

function collectSubjectEvidence(subject: ConstraintSubject, proposal: ProposalExtraction): SubjectEvidence {
  const solutionLikeIntent = proposal.intent !== "analysis";
  if (subject === "language" || subject === "framework" || subject === "database" || subject === "technology") {
    return {
      relevant: solutionLikeIntent || proposal.technologiesUsed.length > 0,
      specified: proposal.technologiesUsed.length > 0 || proposal.rejectedChoices.length > 0,
      positive: proposal.technologiesUsed,
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "architecture") {
    return {
      relevant: proposal.intent === "architecture_design" || proposal.architectureChoices.length > 0 || solutionLikeIntent,
      specified: proposal.architectureChoices.length > 0 || proposal.rejectedChoices.length > 0,
      positive: proposal.architectureChoices,
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "integration") {
    return {
      relevant: proposal.intent === "integration_change" || proposal.integrationChoices.length > 0 || proposal.operations.includes("integrate_via_gateway"),
      specified: proposal.integrationChoices.length > 0 || proposal.operations.includes("integrate_via_gateway") || proposal.operations.includes("direct_integration"),
      positive: unique([...proposal.integrationChoices, ...proposal.operations]),
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "deployment" || subject === "ops") {
    return {
      relevant: proposal.intent === "ops_change" || proposal.deploymentChoices.length > 0 || proposal.operations.includes("write_prod") || proposal.operations.includes("read_only_prod"),
      specified: proposal.deploymentChoices.length > 0 || proposal.operations.includes("write_prod") || proposal.operations.includes("read_only_prod"),
      positive: unique([...proposal.deploymentChoices, ...proposal.operations, ...proposal.securityActions]),
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "data_handling") {
    return {
      relevant: proposal.intent === "data_change" || proposal.dataHandling.length > 0 || proposal.operations.some((item) => item.includes("data") || item.includes("pii")),
      specified: proposal.dataHandling.length > 0 || proposal.operations.includes("store_pii") || proposal.operations.includes("store_tokenized_reference"),
      positive: unique([...proposal.dataHandling, ...proposal.operations, ...proposal.entities]),
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "security") {
    return {
      relevant: proposal.intent === "security_change" || proposal.securityActions.length > 0,
      specified: proposal.securityActions.length > 0,
      positive: unique([...proposal.securityActions, ...proposal.operations]),
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "business_rule") {
    return {
      relevant: proposal.intent === "business_change" || proposal.businessActions.length > 0,
      specified: proposal.businessActions.length > 0,
      positive: unique([...proposal.businessActions, ...proposal.operations]),
      negative: proposal.rejectedChoices,
    };
  }
  if (subject === "ui_behavior") {
    return {
      relevant: proposal.intent === "ui_change" || proposal.uiBehaviors.length > 0,
      specified: proposal.uiBehaviors.length > 0,
      positive: proposal.uiBehaviors,
      negative: proposal.rejectedChoices,
    };
  }
  return {
    relevant: solutionLikeIntent,
    specified: proposal.technologiesUsed.length > 0 || proposal.architectureChoices.length > 0 || proposal.operations.length > 0,
    positive: unique([
      ...proposal.technologiesUsed,
      ...proposal.architectureChoices,
      ...proposal.operations,
      ...proposal.integrationChoices,
      ...proposal.deploymentChoices,
    ]),
    negative: proposal.rejectedChoices,
  };
}

function hasStringMatch(values: string[], expected: string[]): boolean {
  return expected.some((item) => values.includes(item));
}

function evaluateSingleConstraint(constraint: Constraint, proposal: ProposalExtraction): GuardDecision {
  const evidence = collectSubjectEvidence(constraint.subject, proposal);
  if (!evidence.relevant) {
    return {
      decision: "ALLOW",
      violatedConstraints: [],
      relevantConstraints: [],
      rationaleShort: "",
      safeAlternatives: [],
    };
  }

  if (!evidence.specified) {
    return {
      decision: "ALLOW",
      violatedConstraints: [],
      relevantConstraints: evidence.relevant ? [constraint.id] : [],
      rationaleShort: "",
      safeAlternatives: [],
    };
  }

  if (constraint.predicate.operator === "BOOLEAN") {
    const actual = getBooleanFieldValue(constraint.predicate.field, proposal);
    if (actual == null) {
      return {
        decision: "ALLOW",
        violatedConstraints: [],
        relevantConstraints: [constraint.id],
        rationaleShort: "",
        safeAlternatives: [],
      };
    }

    const expected = constraint.predicate.value === true;
    const violates = actual !== expected;
    return violates
      ? {
          decision: "REFUSE",
          violatedConstraints: [constraint.id],
          relevantConstraints: [constraint.id],
          rationaleShort: `Предложенный путь конфликтует с ограничением ${constraint.title}.`,
          safeAlternatives: buildSafeAlternatives([constraint]),
        }
      : {
          decision: "ALLOW",
          violatedConstraints: [],
          relevantConstraints: [constraint.id],
          rationaleShort: "",
          safeAlternatives: [],
        };
  }

  const expectedValues = getConstraintValueAsStrings(constraint.predicate);
  const positiveMatch = hasStringMatch(evidence.positive.map(canonicalizeChoice), expectedValues);
  const negativeMatch = hasStringMatch(evidence.negative.map(canonicalizeChoice), expectedValues);

  if (constraint.kind === "FORBID") {
    return positiveMatch
      ? {
          decision: "REFUSE",
          violatedConstraints: [constraint.id],
          relevantConstraints: [constraint.id],
          rationaleShort: `Предложение явно использует запрещённый вариант по ограничению ${constraint.title}.`,
          safeAlternatives: buildSafeAlternatives([constraint]),
        }
      : {
          decision: "ALLOW",
          violatedConstraints: [],
          relevantConstraints: [constraint.id],
          rationaleShort: "",
          safeAlternatives: [],
        };
  }

  if (constraint.kind === "REQUIRE" || constraint.kind === "LIMIT" || constraint.kind === "ALWAYS") {
    if (positiveMatch) {
      return {
        decision: "ALLOW",
        violatedConstraints: [],
        relevantConstraints: [constraint.id],
        rationaleShort: "",
        safeAlternatives: [],
      };
    }
    if (negativeMatch || evidence.positive.length > 0) {
      return {
        decision: "REFUSE",
        violatedConstraints: [constraint.id],
        relevantConstraints: [constraint.id],
        rationaleShort: `Предложение не соблюдает обязательное ограничение ${constraint.title}.`,
        safeAlternatives: buildSafeAlternatives([constraint]),
      };
    }
  }

  return {
    decision: "ALLOW",
    violatedConstraints: [],
    relevantConstraints: [constraint.id],
    rationaleShort: "",
    safeAlternatives: [],
  };
}

export function evaluateConstraints(constraints: Constraint[], proposal: ProposalExtraction): GuardDecision {
  const relevantConstraints: string[] = [];
  const violatedConstraints: string[] = [];
  const safeAlternatives: string[] = [];

  for (const constraint of [...constraints].sort((a, b) => a.priority - b.priority)) {
    const result = evaluateSingleConstraint(constraint, proposal);
    relevantConstraints.push(...result.relevantConstraints);
    violatedConstraints.push(...result.violatedConstraints);
    safeAlternatives.push(...result.safeAlternatives);
  }

  if (violatedConstraints.length > 0) {
    return {
      decision: "REFUSE",
      violatedConstraints: unique(violatedConstraints),
      relevantConstraints: unique(relevantConstraints),
      rationaleShort: "Предложенный путь нарушает активные ограничения.",
      safeAlternatives: unique(safeAlternatives).slice(0, 3),
    };
  }

  return {
    decision: "ALLOW",
    violatedConstraints: [],
    relevantConstraints: unique(relevantConstraints),
    rationaleShort: "Активные ограничения не конфликтуют с текущим предложением.",
    safeAlternatives: [],
  };
}

export function buildSafeAlternatives(constraints: Constraint[]): string[] {
  const alternatives: string[] = [];
  for (const constraint of constraints) {
    if (constraint.predicate.field === "store_pii") {
      alternatives.push("Хранить токен, хеш или анонимизированный идентификатор вместо исходных PII.");
      continue;
    }
    if (constraint.predicate.field === "prod_write_access") {
      alternatives.push("Ограничиться read-only доступом к проде и выполнять изменения вне production.");
      continue;
    }
    if (constraint.predicate.field === "via_gateway") {
      alternatives.push("Пустить интеграцию через единый gateway вместо прямого подключения.");
      continue;
    }
    if (constraint.predicate.field === "no_dark_patterns") {
      alternatives.push("Собрать прозрачный UX без манипулятивных паттернов.");
      continue;
    }

    const value = getConstraintValueAsStrings(constraint.predicate)[0];
    if (constraint.kind === "FORBID") {
      alternatives.push(`Выбрать вариант без ${value || "запрещённого элемента"}.`);
      continue;
    }
    alternatives.push(`Соблюсти обязательное ограничение: ${constraint.originalText}.`);
  }
  return unique(alternatives);
}

export function formatConstraintForPrompt(constraint: Constraint): string {
  const value = Array.isArray(constraint.predicate.value) ? constraint.predicate.value.join(",") : String(constraint.predicate.value);
  return `[${constraint.id}] ${constraint.kind} subject=${constraint.subject} predicate=${constraint.predicate.field}:${constraint.predicate.operator}:${value} source="${constraint.originalText}"`;
}
