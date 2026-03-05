import type { ChatMessageParam } from "@/lib/llmClient";
import * as memory from "./memoryService";
import type { AgentPhase } from "@/types/agentPhase";

const BASE_SYSTEM_PROMPT = `You are a helpful assistant. You have access to:
1) Working memory: current task goal, plan, status, and decisions for this conversation.
2) Long-term memory: user preferences and stable facts that persist across chats.
Use them to personalize and stay consistent. When the user confirms preferences or durable facts, they will be stored in long-term memory.`;

const PHASE_RULES: Record<AgentPhase, string> = {
  Planning: `CURRENT_PHASE=Planning
Rules:
- Do NOT execute the task.
- Do NOT provide final deliverables, ready code, patches, diffs, or complete solution text.
- Ask clarifying questions required to execute correctly.
- Provide a short execution plan (2-5 steps).
- End with an explicit confirmation request: user must reply "приступай" to move forward.`,
  Execution: `CURRENT_PHASE=Execution
Rules:
- Execute the already confirmed task.
- Provide the concrete result (code, instructions, edits, or explanation requested by the user).
- Do not mention internal state machine or hidden metadata.`,
  Validation: `CURRENT_PHASE=Validation
Rules:
- Validate the produced result against requirements.
- Return a checklist of what is done/not done.
- List risks and verification steps.`,
  Done: `CURRENT_PHASE=Done
Rules:
- Give a short summary of what was delivered.
- Offer one concise next-step recommendation.`,
};

/** Build messages for OpenAI: system + long-term (always in session) + working + short (last N). */
export async function buildContextForSession(
  sessionId: string,
  phase: AgentPhase
): Promise<ChatMessageParam[]> {
  const [short, working, longTermForSession] = await Promise.all([
    memory.getShortMemory(sessionId),
    memory.getWorkingMemory(sessionId),
    memory.getLongTermForSession("user"),
  ]);

  const parts: string[] = [BASE_SYSTEM_PROMPT, PHASE_RULES[phase]];

  if (longTermForSession.length > 0) {
    parts.push(
      "\n[Long-term memory — always use in this session]\n" +
        longTermForSession.map((l) => `- ${l.contentText}${l.tags ? ` (${l.tags})` : ""}`).join("\n")
    );
  }

  if (working?.contentText) {
    parts.push("\n[Working memory (current task)]\n" + working.contentText);
  }

  const systemContent = parts.join("\n");
  const messages: ChatMessageParam[] = [{ role: "system", content: systemContent }];

  for (const m of short.messages) {
    messages.push({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    });
  }

  return messages;
}
