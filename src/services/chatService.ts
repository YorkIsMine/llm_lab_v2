import { prisma } from "@/lib/db";
import { createChatCompletion, createMemoryUpdateCompletion } from "@/lib/llmClient";
import * as memory from "./memoryService";
import { buildContextForSession } from "./contextService";

export interface SendMessageResult {
  messageId: string;
  role: "assistant";
  content: string;
  createdAt: string;
}

/** Send user message, get assistant reply, persist both, update memories. */
export async function sendMessage(sessionId: string, userContent: string): Promise<SendMessageResult> {
  await prisma.message.create({
    data: { sessionId, role: "user", content: userContent },
  });

  const messages = await buildContextForSession(sessionId, userContent);
  messages.push({ role: "user", content: userContent });

  const { content: assistantContent } = await createChatCompletion(messages);

  const assistant = await prisma.message.create({
    data: { sessionId, role: "assistant", content: assistantContent },
  });

  await updateMemoriesAfterReply(sessionId, userContent, assistantContent);

  return {
    messageId: assistant.id,
    role: "assistant",
    content: assistant.content,
    createdAt: assistant.createdAt.toISOString(),
  };
}

async function updateMemoriesAfterReply(
  sessionId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  const working = await memory.getWorkingMemory(sessionId);
  const currentWorkingJson = working?.contentJson ?? "{}";

  const { working: newWorkingJson, longTerm: longTermJson } = await createMemoryUpdateCompletion(
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

  let longTermItems: string[] = [];
  try {
    longTermItems = JSON.parse(longTermJson) as string[];
  } catch {
    // ignore
  }
  for (const fact of longTermItems) {
    if (typeof fact !== "string" || !fact.trim()) continue;
    const key = `fact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await memory.addLongTermMemory("user", key, fact.trim(), JSON.stringify({ text: fact }), "");
  }
}
