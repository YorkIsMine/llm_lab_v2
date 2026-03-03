import type { ChatMessageParam } from "@/lib/llmClient";
import * as memory from "./memoryService";

const SYSTEM_PROMPT = `You are a helpful assistant. You have access to:
1) Working memory: current task goal, plan, status, and decisions for this conversation.
2) Long-term memory: user preferences and stable facts that persist across chats.
Use them to personalize and stay consistent. When the user confirms preferences or durable facts, they will be stored in long-term memory.`;

/** Build messages for OpenAI: system + long-term (always in session) + working + short (last N). */
export async function buildContextForSession(
  sessionId: string,
  _lastUserMessage: string
): Promise<ChatMessageParam[]> {
  const [short, working, longTermForSession] = await Promise.all([
    memory.getShortMemory(sessionId),
    memory.getWorkingMemory(sessionId),
    memory.getLongTermForSession("user"),
  ]);

  const parts: string[] = [SYSTEM_PROMPT];

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
