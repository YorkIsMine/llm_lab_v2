import { prisma } from "@/lib/db";
import { keywordRelevanceProvider } from "@/lib/relevance";

const SHORT_MEMORY_MESSAGES = 10;

export interface ShortMemory {
  type: "short";
  messages: { role: string; content: string; createdAt: string }[];
  description: string;
}

export interface WorkingMemoryView {
  type: "working";
  contentText: string;
  contentJson: string;
  updatedAt: string;
}

export interface LongTermMemoryItem {
  id: string;
  scope: string;
  key: string;
  contentText: string;
  contentJson: string;
  tags: string;
  updatedAt: string;
}

export interface MemoryView {
  short: ShortMemory;
  working: WorkingMemoryView | null;
  longTerm: LongTermMemoryItem[];
}

/** Short memory: last N messages (ephemeral, computed). */
export async function getShortMemory(sessionId: string): Promise<ShortMemory> {
  const messages = await prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: SHORT_MEMORY_MESSAGES,
  });
  messages.reverse();
  return {
    type: "short",
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
    description: `Last ${SHORT_MEMORY_MESSAGES} messages`,
  };
}

/** Working memory for session (persisted). */
export async function getWorkingMemory(sessionId: string): Promise<WorkingMemoryView | null> {
  const w = await prisma.workingMemory.findUnique({
    where: { sessionId },
  });
  if (!w) return null;
  return {
    type: "working",
    contentText: w.contentText,
    contentJson: w.contentJson,
    updatedAt: w.updatedAt.toISOString(),
  };
}

/** Long-term memory: user scope (and optionally global). */
export async function getLongTermMemory(scope?: "user" | "global"): Promise<LongTermMemoryItem[]> {
  const where = scope ? { scope } : {};
  const items = await prisma.longTermMemory.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });
  return items.map((item) => ({
    id: item.id,
    scope: item.scope,
    key: item.key,
    contentText: item.contentText,
    contentJson: item.contentJson,
    tags: item.tags,
    updatedAt: item.updatedAt.toISOString(),
  }));
}

/** Get relevant long-term items for context (keyword match; TODO: embedding). */
export async function getRelevantLongTerm(userMessage: string, limit = 5): Promise<LongTermMemoryItem[]> {
  const relevant = await keywordRelevanceProvider.findRelevant(userMessage, limit);
  if (relevant.length === 0) return [];
  const ids = relevant.map((r) => r.id);
  const items = await prisma.longTermMemory.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => {
    const item = byId.get(id)!;
    return {
      id: item.id,
      scope: item.scope,
      key: item.key,
      contentText: item.contentText,
      contentJson: item.contentJson,
      tags: item.tags,
      updatedAt: item.updatedAt.toISOString(),
    };
  });
}

/** Full memory view for a session (for Memory Inspector). */
export async function getMemoryView(sessionId: string): Promise<MemoryView> {
  const [short, working, longTerm] = await Promise.all([
    getShortMemory(sessionId),
    getWorkingMemory(sessionId),
    getLongTermMemory("user"),
  ]);
  return { short, working, longTerm };
}

/** Upsert working memory for session. */
export async function setWorkingMemory(sessionId: string, contentText: string, contentJson: string): Promise<void> {
  await prisma.workingMemory.upsert({
    where: { sessionId },
    create: { sessionId, contentText, contentJson },
    update: { contentText, contentJson },
  });
}

/** Add or update long-term memory by (scope, key). */
export async function addLongTermMemory(
  scope: "user" | "global",
  key: string,
  contentText: string,
  contentJson: string,
  tags: string
): Promise<LongTermMemoryItem> {
  const updated = await prisma.longTermMemory.upsert({
    where: { scope_key: { scope, key } },
    create: { scope, key, contentText, contentJson, tags },
    update: { contentText, contentJson, tags },
  });
  return toItem(updated);
}

/** Create or update long-term by id (for API POST); key defaults to id. */
export async function upsertLongTermMemory(
  scope: "user" | "global",
  id: string,
  contentText: string,
  contentJson: string,
  tags: string
): Promise<LongTermMemoryItem> {
  const updated = await prisma.longTermMemory.upsert({
    where: { scope_key: { scope, key: id } },
    create: { scope, key: id, contentText, contentJson, tags },
    update: { contentText, contentJson, tags },
  });
  return toItem(updated);
}

function toItem(row: {
  id: string;
  scope: string;
  key: string;
  contentText: string;
  contentJson: string;
  tags: string;
  updatedAt: Date;
}): LongTermMemoryItem {
  return {
    id: row.id,
    scope: row.scope,
    key: row.key,
    contentText: row.contentText,
    contentJson: row.contentJson,
    tags: row.tags,
    updatedAt: row.updatedAt.toISOString(),
  };
}
