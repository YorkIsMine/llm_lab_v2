/**
 * Long-term memory relevance: keyword matching (minimal).
 * TODO: Replace with embedding + cosine similarity; store embeddings in LongTermMemory.embedding.
 */

import type { LongTermRelevanceProvider } from "@/types/memory";
import { prisma } from "./db";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((s) => s.length > 1);
}

function score(text: string, queryTokens: Set<string>): number {
  const tokens = new Set(tokenize(text));
  let hits = 0;
  Array.from(queryTokens).forEach((t) => {
    if (tokens.has(t)) hits++;
  });
  return queryTokens.size > 0 ? hits / queryTokens.size : 0;
}

export const keywordRelevanceProvider: LongTermRelevanceProvider = {
  async findRelevant(userMessage: string, limit = 5) {
    const queryTokens = new Set(tokenize(userMessage));
    if (queryTokens.size === 0) return [];

    const items = await prisma.longTermMemory.findMany({
      where: { scope: "user" },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    const scored = items
      .map((item) => ({
        id: item.id,
        contentText: item.contentText,
        score: score(item.contentText + " " + item.tags, queryTokens),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored;
  },
};
