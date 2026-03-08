import type { ChatMessageParam } from "@/lib/llmClient";
import * as memory from "./memoryService";
import type { AgentPhase } from "@/types/agentPhase";
import type { Constraint, GuardDecision, Invariant, ProposalExtraction } from "@/types/invariant";
import type { ApprovedPlanSnapshot, ExecutionArtifacts, ValidationReport } from "@/types/taskLifecycle";
import { formatConstraintForPrompt } from "./invariantConstraints";

const BASE_SYSTEM_PROMPT = `You are a helpful assistant. You have access to:
1) Working memory: current task goal, plan, status, and decisions for this conversation.
2) Long-term memory: user preferences and stable facts that persist across chats.
Use them to personalize and stay consistent. When the user confirms preferences or durable facts, they will be stored in long-term memory.`;

const PHASE_RULES: Record<AgentPhase, string> = {
  planning: `CURRENT_PHASE=planning
Rules:
- Do NOT execute the task.
- Do NOT provide final deliverables, ready code, patches, diffs, or complete solution text.
- Ask clarifying questions required to execute correctly.
- Provide a short execution plan (2-5 steps).
- Ask the user to confirm in meaning when execution may start; do not require any fixed phrase.`,
  execution: `CURRENT_PHASE=execution
Rules:
- Execute strictly against the approved plan snapshot.
- Provide the concrete result (code, instructions, edits, or explanation requested by the user).
- Do not mention internal state machine or hidden metadata.`,
  validation: `CURRENT_PHASE=validation
Rules:
- Validate the produced result against the approved plan and actual execution artifacts.
- Return a checklist of what is done/not done.
- List risks and verification steps.`,
  completed: `CURRENT_PHASE=completed
Rules:
- Give a short summary of what was delivered and successfully validated.
- Offer one concise next-step recommendation.`,
};

export interface PromptInvariantContext {
  enabled: boolean;
  invariants: Invariant[];
  constraints?: Constraint[];
  requestProposal?: ProposalExtraction;
  preGenerationDecision?: GuardDecision;
}

export interface ComposeContextInput {
  phase: AgentPhase;
  shortMemory: memory.ShortMemory;
  workingMemory: memory.WorkingMemoryView | null;
  longTermMemory: memory.LongTermMemoryItem[];
  invariantContext?: PromptInvariantContext;
  workflowContext?: WorkflowPromptContext;
}

export interface WorkflowPromptContext {
  currentState: AgentPhase;
  approvedPlanSnapshot?: ApprovedPlanSnapshot | null;
  executionArtifacts?: ExecutionArtifacts | null;
  validationReport?: ValidationReport | null;
}

function formatInvariantSystemBlock(invariantContext?: PromptInvariantContext): string | null {
  if (!invariantContext || !invariantContext.enabled || invariantContext.invariants.length === 0) {
    return null;
  }
  const rendered = invariantContext.invariants
    .map((item) => `- [${item.id}] ${item.title}: ${item.rule}`)
    .join("\n");
  const renderedConstraints =
    invariantContext.constraints && invariantContext.constraints.length > 0
      ? invariantContext.constraints.map((constraint) => `- ${formatConstraintForPrompt(constraint)}`).join("\n")
      : "- (No normalized constraints)";
  const proposalSummary = invariantContext.requestProposal?.summary || "intent=unknown";
  const precheckSummary = invariantContext.preGenerationDecision
    ? `${invariantContext.preGenerationDecision.decision} :: ${invariantContext.preGenerationDecision.rationaleShort}`
    : "ALLOW";

  return [
    "INVARIANTS (non-negotiable):",
    rendered,
    "",
    "NORMALIZED CONSTRAINTS:",
    renderedConstraints,
    "",
    `REQUEST PROPOSAL SNAPSHOT: ${proposalSummary}`,
    `PRECHECK: ${precheckSummary}`,
    "",
    "ENFORCEMENT:",
    "Ты обязан соблюдать все INVARIANTS и NORMALIZED CONSTRAINTS.",
    "Применяй constraint только если он релевантен текущему proposal; не расширяй точечный запрет до целой категории.",
    "Если proposal конфликтует с constraint, коротко назови constraint ids/titles и предложи 1–3 безопасные альтернативы.",
    "Всегда добавляй в конце ответа: Invariant check: OK или Invariant check: REFUSED (violates: <ids>).",
    "Не раскрывай внутренние рассуждения.",
  ].join("\n");
}

function formatWorkflowSystemBlock(workflowContext?: WorkflowPromptContext): string | null {
  if (!workflowContext) return null;

  const approvedPlan = workflowContext.approvedPlanSnapshot
    ? [
        `Goal: ${workflowContext.approvedPlanSnapshot.goal || "(not captured)"}`,
        workflowContext.approvedPlanSnapshot.plan.length > 0
          ? `Plan:\n${workflowContext.approvedPlanSnapshot.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
          : "Plan: (not captured)",
      ].join("\n")
    : "Approved plan snapshot: (not available)";

  const executionArtifacts = workflowContext.executionArtifacts
    ? [
        `Execution artifact status: ${workflowContext.executionArtifacts.status}`,
        workflowContext.executionArtifacts.progressSummary
          ? `Execution summary: ${workflowContext.executionArtifacts.progressSummary}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Execution artifact: (not available)";

  const validationReport = workflowContext.validationReport
    ? [
        `Validation report status: ${workflowContext.validationReport.status}`,
        workflowContext.validationReport.assessment
          ? `Validation passed: ${workflowContext.validationReport.assessment.passed ? "yes" : "no"}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "Validation report: (not available)";

  return [
    "WORKFLOW STATE:",
    `current_state=${workflowContext.currentState}`,
    "",
    approvedPlan,
    "",
    executionArtifacts,
    "",
    validationReport,
  ].join("\n");
}

export function composeContextMessages(input: ComposeContextInput): ChatMessageParam[] {
  const parts: string[] = [BASE_SYSTEM_PROMPT, PHASE_RULES[input.phase]];
  const invariantBlock = formatInvariantSystemBlock(input.invariantContext);
  if (invariantBlock) {
    parts.push("\n" + invariantBlock);
  }
  const workflowBlock = formatWorkflowSystemBlock(input.workflowContext);
  if (workflowBlock) {
    parts.push("\n" + workflowBlock);
  }

  if (input.longTermMemory.length > 0) {
    parts.push(
      "\n[Long-term memory — always use in this session]\n" +
        input.longTermMemory.map((l) => `- ${l.contentText}${l.tags ? ` (${l.tags})` : ""}`).join("\n")
    );
  }

  if (input.workingMemory?.contentText) {
    parts.push("\n[Working memory (current task)]\n" + input.workingMemory.contentText);
  }

  const systemContent = parts.join("\n");
  const messages: ChatMessageParam[] = [{ role: "system", content: systemContent }];

  for (const m of input.shortMemory.messages) {
    messages.push({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    });
  }

  return messages;
}

/** Build messages for OpenAI: system + long-term (always in session) + working + short (last N). */
export async function buildContextForSession(
  sessionId: string,
  phase: AgentPhase,
  invariantContext?: PromptInvariantContext,
  workflowContext?: WorkflowPromptContext
): Promise<ChatMessageParam[]> {
  const [short, working, longTermForSession] = await Promise.all([
    memory.getShortMemory(sessionId),
    memory.getWorkingMemory(sessionId),
    memory.getLongTermForSession("user"),
  ]);

  return composeContextMessages({
    phase,
    shortMemory: short,
    workingMemory: working,
    longTermMemory: longTermForSession,
    invariantContext,
    workflowContext,
  });
}
