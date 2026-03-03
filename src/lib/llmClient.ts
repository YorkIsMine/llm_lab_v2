import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

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

  const openai = getOpenAI();
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

/** One long-term memory entry with optional category tag (solutions from assistant are not stored). */
export interface LongTermEntry {
  text: string;
  tag?: "personal" | "knowledge";
}

/**
 * Structured output for memory update (goal, plan, decisions, long-term facts).
 * Long-term: only personal info and knowledge from user — no assistant solutions.
 */
export async function createMemoryUpdateCompletion(
  userMessage: string,
  assistantReply: string,
  currentWorkingJson: string,
  options: ChatCompletionOptions = {}
): Promise<{ working: string; longTerm: LongTermEntry[] }> {
  const systemPrompt = `You are a memory extractor. Given the last user message, assistant reply, and current working memory JSON, output a single JSON object with two keys:

- "working": updated working memory JSON (goal, plan, status, decisions, constraints). Merge new info with current; keep structure.

- "longTerm": array of 0+ items to store in long-term memory. Each item must be: { "text": "short clear fact", "tag": "personal" | "knowledge" }.
  Include ONLY these two types (do NOT add solutions or decisions from the assistant):
  1. "personal" — персонализированная информация: предпочтения пользователя, привычки, профиль, как он хочет общаться, имя/роль, контекст жизни.
  2. "knowledge" — знания, переданные от пользователя: факты, данные, правила, которые пользователь явно сообщил и которые стоит помнить в других чатах.

Do NOT include in longTerm: решения/выводы ассистента, что было сделано по задаче, предложенные способы — только информация от пользователя и о пользователе.

Empty array if nothing to add. Keep each "text" concise (one sentence). Use the tag that best fits.

Current working memory (JSON): ${currentWorkingJson}

Respond with valid JSON only, no markdown.`;

  const openai = getOpenAI();
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
  let parsed: { working?: string; longTerm?: unknown };
  try {
    parsed = JSON.parse(cleaned) as { working?: string; longTerm?: unknown };
  } catch {
    return { working: currentWorkingJson, longTerm: [] };
  }

  const working = typeof parsed.working === "string" ? parsed.working : JSON.stringify(parsed.working ?? {});
  const lt = parsed.longTerm;
  const longTerm: LongTermEntry[] = [];
  if (Array.isArray(lt)) {
    for (const item of lt) {
      if (item && typeof item === "object" && "text" in item && typeof (item as { text: unknown }).text === "string") {
        const t = (item as { text: string; tag?: string }).text.trim();
        const tag = (item as { tag?: string }).tag;
        if (t) {
          const allowedTag = tag === "personal" || tag === "knowledge" ? tag : undefined;
          if (tag !== "solution") longTerm.push({ text: t, tag: allowedTag });
        }
      } else if (typeof item === "string" && item.trim()) {
        longTerm.push({ text: item.trim(), tag: "knowledge" });
      }
    }
  }

  return { working, longTerm };
}

/**
 * Отдельная LLM: решает, стоит ли сохранять каждый новый факт в базу знаний.
 * На входе: текущая база знаний (список фактов) и кандидаты на запись.
 * На выходе: массив флагов — true = записать, false = дубликат/не записывать.
 */
export async function shouldSaveFactsToLongTerm(
  existingKnowledgeBase: string[],
  newFacts: string[],
  options: ChatCompletionOptions = {}
): Promise<boolean[]> {
  if (newFacts.length === 0) return [];

  const systemPrompt = `You are a deduplication checker for a knowledge base. You receive:
1) Current knowledge base: list of facts already stored.
2) New facts: candidates to add.

Your task: for EACH new fact, output true or false.
- true = save to the knowledge base (fact is new, non-duplicate, worth storing).
- false = do NOT save (fact is duplicate, redundant, or already implied by existing knowledge; or trivial/not worth storing).

Compare by meaning, not exact wording. If a new fact repeats or is implied by something already in the base, output false. If it adds new information, output true.

Respond with a JSON object: { "save": [boolean, boolean, ...] } — one boolean per new fact in the same order. No markdown.`;

  const userContent = `Current knowledge base (${existingKnowledgeBase.length} items):\n${
    existingKnowledgeBase.length > 0
      ? existingKnowledgeBase.map((f, i) => `${i + 1}. ${f}`).join("\n")
      : "(empty)"
  }\n\nNew facts to evaluate (in order):\n${newFacts.map((f, i) => `${i + 1}. ${f}`).join("\n")}`;

  const openai = getOpenAI();
  const response = await openai.chat.completions.create({
    model: options.model ?? "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: options.maxTokens ?? 256,
    temperature: 0.1,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: { save?: boolean[] };
  try {
    parsed = JSON.parse(cleaned) as { save?: boolean[] };
  } catch {
    return newFacts.map(() => false);
  }

  const save = Array.isArray(parsed.save) ? parsed.save : [];
  return newFacts.map((_, i) => save[i] === true);
}
