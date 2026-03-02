export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface WorkingMemoryPayload {
  goal?: string;
  plan?: string[];
  status?: string;
  decisions?: string[];
  constraints?: string[];
  [key: string]: unknown;
}

export interface LongTermMemoryPayload {
  preferences?: string[];
  facts?: string[];
  rules?: string[];
  [key: string]: unknown;
}

/** Relevance for long-term memory. Keyword match now; TODO: embedding + cosine similarity. */
export interface LongTermRelevanceProvider {
  findRelevant(userMessage: string, limit?: number): Promise<{ id: string; contentText: string; score: number }[]>;
}
