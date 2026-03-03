import { prisma } from "@/lib/db";
import { createChatCompletion, createMemoryUpdateCompletion, shouldSaveFactsToLongTerm } from "@/lib/llmClient";
import * as memory from "./memoryService";
import { buildContextForSession } from "./contextService";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface SendMessageResult {
  messageId: string;
  role: "assistant";
  content: string;
  createdAt: string;
  usage?: TokenUsage;
}

const CLEAR_MEMORY_PHRASES = [
  "очисти долговременную память",
  "очисти long term",
  "удали долговременную память",
  "удали long term",
  "стереть память",
  "очисти память",
  "удали память",
  "clear long term memory",
  "clear memory",
  "очисти long term memory",
  "удали long term memory",
];

function isClearMemoryRequest(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  return CLEAR_MEMORY_PHRASES.some((phrase) => normalized.includes(phrase.toLowerCase()));
}

/** Send user message, get assistant reply, persist both, update memories. */
export async function sendMessage(sessionId: string, userContent: string): Promise<SendMessageResult> {
  if (isClearMemoryRequest(userContent)) {
    await memory.clearLongTermMemory("user");
  }

  await prisma.message.create({
    data: { sessionId, role: "user", content: userContent },
  });

  const messages = await buildContextForSession(sessionId, userContent);
  messages.push({ role: "user", content: userContent });

  const { content: assistantContent, usage } = await createChatCompletion(messages);

  const assistant = await prisma.message.create({
    data: { sessionId, role: "assistant", content: assistantContent },
  });

  await updateMemoriesAfterReply(sessionId, userContent, assistantContent);

  const tokenUsage: TokenUsage | undefined = usage
    ? {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.promptTokens + usage.completionTokens,
      }
    : undefined;

  return {
    messageId: assistant.id,
    role: "assistant",
    content: assistant.content,
    createdAt: assistant.createdAt.toISOString(),
    usage: tokenUsage,
  };
}

async function updateMemoriesAfterReply(
  sessionId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const working = await memory.getWorkingMemory(sessionId);
  const currentWorkingJson = working?.contentJson ?? "{}";

  const { working: newWorkingJson, longTerm: longTermEntries } = await createMemoryUpdateCompletion(
    userMessage,
    assistantReply,
    currentWorkingJson
  );

  let workingText = newWorkingJson;
  try {
    const parsed = JSON.parse(newWorkingJson) as Record<string, unknown>;
    workingText = Object.entries(parsed)
      .filter(([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ""))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("; ") : v}`)
      .join("\n");
  } catch {
    // keep raw
  }
  await memory.setWorkingMemory(sessionId, workingText, newWorkingJson);

  const validEntries = longTermEntries.filter((e) => e.text.trim());
  if (validEntries.length === 0) return;

  const existingBase = (await memory.getLongTermMemory("user")).map((item) => item.contentText);
  const newFacts = validEntries.map((e) => e.text.trim());
  const saveFlags = await shouldSaveFactsToLongTerm(existingBase, newFacts);

  for (let i = 0; i < validEntries.length; i++) {
    if (!saveFlags[i]) continue;
    const entry = validEntries[i];
    const key = `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const tags = entry.tag ?? "";
    const contentJson = JSON.stringify({ text: entry.text, tag: entry.tag });
    await memory.addLongTermMemory("user", key, entry.text.trim(), contentJson, tags);
  }
}
