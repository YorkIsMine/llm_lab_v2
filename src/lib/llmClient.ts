import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ChatMessageParam = ChatCompletionMessageParam;

export interface ChatCompletionOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Single call to OpenAI Chat Completions API.
 * All context (system, long-term, working, short) must be assembled by caller.
 */
export async function createChatCompletion(
  messages: ChatCompletionMessageParam[],
  options: ChatCompletionOptions = {}
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
  const { model = "gpt-4o-mini", maxTokens = 4096, temperature = 0.7 } = options;

  const response = await openai.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
  });

  const content = response.choices[0]?.message?.content ?? "";
  const usage = response.usage
    ? { promptTokens: response.usage.prompt_tokens, completionTokens: response.usage.completion_tokens }
    : undefined;

  return { content, usage };
}

/**
 * Structured output for memory update (goal, plan, decisions, long-term facts).
 * Uses JSON mode for reliable parsing.
 */
export async function createMemoryUpdateCompletion(
  userMessage: string,
  assistantReply: string,
  currentWorkingJson: string,
  options: ChatCompletionOptions = {}
): Promise<{ working: string; longTerm: string }> {
  const systemPrompt = `You are a memory extractor. Given the last user message, assistant reply, and current working memory JSON, output a single JSON object with two keys:
- "working": updated working memory JSON (goal, plan, status, decisions, constraints). Merge new info with current; keep structure.
- "longTerm": array of 0+ stable facts to store in long-term memory (user preferences, confirmed rules, durable facts). Only include things that should persist across chats. Empty array if nothing to add.

Current working memory (JSON): ${currentWorkingJson}

Respond with valid JSON only, no markdown.`;

  const response = await openai.chat.completions.create({
    model: options.model ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `User: ${userMessage}\n\nAssistant: ${assistantReply}` },
    ],
    max_tokens: options.maxTokens ?? 1024,
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: { working?: string; longTerm?: string | string[] };
  try {
    parsed = JSON.parse(cleaned) as { working?: string; longTerm?: string | string[] };
  } catch {
    return { working: currentWorkingJson, longTerm: "[]" };
  }

  const working = typeof parsed.working === "string" ? parsed.working : JSON.stringify(parsed.working ?? {});
  const lt = parsed.longTerm;
  const longTerm = Array.isArray(lt) ? JSON.stringify(lt) : typeof lt === "string" ? lt : "[]";

  return { working, longTerm };
}
