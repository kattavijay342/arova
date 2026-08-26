import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiEnv } from "./aiEnv";
import { SYSTEM_INSTRUCTIONS } from "./systemInstructions";
import type { Mode } from "@/lib/types";

interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Calls the Gemini API and yields the reply progressively, chunk by chunk,
 * as it's generated. Throws a clear Error if GEMINI_API_KEY is missing
 * (config error) or if the request/stream fails (network/quota/model
 * error) — callers should catch and turn these into a clean API response
 * rather than letting them surface as a raw stack trace.
 */
export async function* streamGeminiReply(
  mode: Mode,
  userMessage: string,
  history: HistoryMessage[] = []
): AsyncGenerator<string, void, unknown> {
  const { apiKey, model: modelName } = getGeminiEnv();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_INSTRUCTIONS[mode],
  });

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: [{ text: userMessage }] },
  ];

  let sawText = false;

  try {
    const result = await model.generateContentStream({ contents });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        sawText = true;
        yield text;
      }
    }
  } catch (err) {
    console.error("[gemini] request failed:", err);
    throw new Error("The AI assistant is temporarily unavailable. Please try again in a moment.");
  }

  if (!sawText) {
    throw new Error("The assistant returned an empty response.");
  }
}
