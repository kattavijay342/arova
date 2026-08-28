import { getGeminiEnv } from "./aiEnv";
import { streamGeminiReply } from "./gemini";
import type { ImageAttachment, Mode } from "@/lib/types";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Google Gemini is the only AI provider for this project. This thin
 * pass-through exists so the route handler doesn't need to change if a
 * second provider is ever added later — it only calls streamAIReply() /
 * validateAIConfig(), never lib/server/gemini.ts directly.
 */
export function validateAIConfig(): void {
  getGeminiEnv();
}

export function streamAIReply(
  mode: Mode,
  userMessage: string,
  history: HistoryMessage[] = [],
  attachment?: ImageAttachment
): AsyncGenerator<string, void, unknown> {
  return streamGeminiReply(mode, userMessage, history, attachment);
}
