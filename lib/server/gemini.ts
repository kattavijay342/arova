import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { getGeminiEnv } from "./aiEnv";
import { SYSTEM_INSTRUCTIONS } from "./systemInstructions";
import type { WebSource } from "@/lib/searchCitations";
import type { ImageAttachment, Mode } from "@/lib/types";

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
 *
 * `attachment`, when present, is sent as an inline image part alongside the
 * current turn's text (Gemini multimodal input). It's never added to
 * `history` — attachments aren't persisted, so a past turn's image can't be
 * reconstructed on later requests.
 *
 * `memoryContext`, when present, is a newline-separated list of short facts
 * the user explicitly saved (see lib/server/memory.ts) — appended to the
 * mode's system instruction so they carry across every conversation, not
 * replayed as history. There is no automatic memory extraction anywhere in
 * this app; this is only ever what the user chose to save.
 *
 * `customInstructions`, when present, is the user's global "about me" /
 * "how to respond" preferences (see lib/server/personalization.ts) —
 * appended the same way as memory, but it's style/context the user set once
 * in Settings rather than a growing list of individual facts.
 *
 * `projectContext`, when present, is a project's custom instructions plus
 * its files' extracted text (see lib/server/project.ts) — appended the same
 * way, but only for conversations that belong to that project.
 *
 * `webSearch`, when true, grounds the reply in live Google Search results
 * instead of the model's training data alone — see the dedicated code path
 * below. Mutually exclusive with `attachment` (checked by the caller): the
 * combination of inline multimodal input and search grounding isn't
 * something this app tries to support.
 *
 * `deepResearch`, when true, also grounds the reply (the same code path as
 * `webSearch` — either one is enough to trigger it) but additionally asks
 * for a thorough, multi-angle, well-structured long-form report instead of
 * a quick grounded answer. It's a prompt-level distinction on top of the
 * same single grounded call, not a separate multi-call pipeline.
 *
 * `codeExecution`, when true, enables Gemini's native code-execution tool
 * instead of search grounding — used for data analysis on an uploaded CSV
 * (see lib/dataset.ts and the messages route). Mutually exclusive with
 * `webSearch`/`deepResearch` in practice (the caller never sets both), and
 * checked first below.
 *
 * `jobFitAnalysis`, when true, asks for a structured resume-vs-job-description
 * match report (see lib/career.ts) instead of an ordinary reply — a
 * prompt-level instruction only, not a separate tool/call path, so it's
 * compatible with a document attachment (the resume) unlike `webSearch`/
 * `deepResearch`/`codeExecution`. Career mode only (enforced by the caller).
 */
export interface StreamReplyOptions {
  attachment?: ImageAttachment;
  memoryContext?: string;
  customInstructions?: string;
  projectContext?: string;
  webSearch?: boolean;
  deepResearch?: boolean;
  codeExecution?: boolean;
  jobFitAnalysis?: boolean;
  /** Invoked once, after streaming finishes, with the sources Google Search grounding cited — only ever called when `webSearch`/`deepResearch` was set and grounding actually happened. */
  onSources?: (sources: WebSource[]) => void;
}

const DATA_ANALYSIS_INSTRUCTION =
  "\n\nThe user has attached a dataset (CSV). Its contents appear earlier in " +
  "this conversation as plain text. Use the code execution tool to actually " +
  "compute any statistics, aggregations, or transformations — read the CSV " +
  "text from the conversation into pandas (e.g. via io.StringIO) and write " +
  "real code rather than estimating numbers by eye. When a chart would help " +
  "explain the data, generate one with matplotlib and save it so it's " +
  "returned as an image. Keep code focused and explain the result in plain " +
  "language alongside it.";

const JOB_FIT_INSTRUCTION =
  "\n\nThe user wants a job-fit analysis: they've shared a job description " +
  "(and, if attached, their resume) and want to know how well they match. " +
  "Reply using exactly this structure, with the literal heading and bullet " +
  "markers so the app can parse it:\n" +
  '1. Start with the literal heading "#### Job Fit Analysis 🎯".\n' +
  '2. On its own line, "## <percent>% Match" with your estimated overall ' +
  "fit as a whole number 0-100.\n" +
  '3. A "**Matching skills**" section with 3-8 bullets, each starting ' +
  '"- ✅ ", for skills/experience from their background that match the job ' +
  "description.\n" +
  '4. A "**Skill gaps**" section with 2-6 bullets, each starting "- ⚠️ ", ' +
  "for requirements in the job description their background doesn't " +
  "clearly show.\n" +
  '5. A "**Suggested resume edits**" section with 2-5 bullets, each ' +
  'starting "- ✏️ ", with specific, actionable edits to better highlight ' +
  "their fit for this exact role.\n" +
  "Base every point on the actual job description and resume/background " +
  "provided — never invent skills or requirements that weren't mentioned.";

const DEEP_RESEARCH_INSTRUCTION =
  "\n\nThe user has asked for deep research on this topic. Use Google Search " +
  "thoroughly: investigate the question from multiple angles, consult " +
  "several distinct sources, and reconcile any disagreement between them " +
  "instead of relying on a single result. Reply with a well-structured, " +
  "long-form report — use markdown headings to organize it by sub-topic, " +
  "and include specific facts, figures, and named sources in the body " +
  "rather than a short summary. Prioritize thoroughness and accuracy over " +
  "brevity.";

function buildSystemInstruction(mode: Mode, options?: StreamReplyOptions): string {
  let instruction = SYSTEM_INSTRUCTIONS[mode];
  if (options?.memoryContext) {
    instruction += `\n\nThe user has explicitly asked you to remember these facts about them. Use them to personalize your answers when relevant — don't force them into unrelated replies, and don't mention that you "have memories" unless the user brings it up:\n${options.memoryContext}`;
  }
  if (options?.customInstructions) {
    instruction += `\n\nThe user has set these preferences in Settings. Follow them in every reply, in addition to (not instead of) your other instructions:\n${options.customInstructions}`;
  }
  if (options?.projectContext) {
    instruction += `\n\nThis conversation belongs to a project with its own instructions and/or reference files. Follow the project's instructions and use its files as context when relevant:\n${options.projectContext}`;
  }
  if (options?.deepResearch) {
    instruction += DEEP_RESEARCH_INSTRUCTION;
  }
  if (options?.codeExecution) {
    instruction += DATA_ANALYSIS_INSTRUCTION;
  }
  if (options?.jobFitAnalysis) {
    instruction += JOB_FIT_INSTRUCTION;
  }
  return instruction;
}

export async function* streamGeminiReply(
  mode: Mode,
  userMessage: string,
  history: HistoryMessage[] = [],
  options?: StreamReplyOptions
): AsyncGenerator<string, void, unknown> {
  const { apiKey, model: modelName } = getGeminiEnv();
  const attachment = options?.attachment;
  const systemInstruction = buildSystemInstruction(mode, options);

  const currentParts = attachment
    ? [
        ...(userMessage ? [{ text: userMessage }] : []),
        { inlineData: { mimeType: attachment.mimeType, data: attachment.data } },
      ]
    : [{ text: userMessage }];

  const contents = [
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    })),
    { role: "user" as const, parts: currentParts },
  ];

  let sawText = false;

  if (options?.codeExecution) {
    yield* streamCodeExecutionReply(apiKey, modelName, systemInstruction, contents);
    return;
  }

  if (options?.webSearch || options?.deepResearch) {
    yield* streamGroundedReply(apiKey, modelName, systemInstruction, contents, options);
    return;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
  });

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

/**
 * Google Search grounding needs `@google/genai` — the older SDK above only
 * types the legacy per-1.5-model `googleSearchRetrieval` tool, not the
 * current `googleSearch` tool this app's model generation expects (verified
 * against the installed SDK's type definitions before adding this). Kept as
 * a separate function, called only when `webSearch` is set, so the
 * already-working default path above is never touched by this addition.
 */
async function* streamGroundedReply(
  apiKey: string,
  modelName: string,
  systemInstruction: string,
  contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[],
  options: StreamReplyOptions
): AsyncGenerator<string, void, unknown> {
  const ai = new GoogleGenAI({ apiKey });

  let sawText = false;
  let sources: WebSource[] = [];

  try {
    const stream = await ai.models.generateContentStream({
      model: modelName,
      contents,
      config: { systemInstruction, tools: [{ googleSearch: {} }] },
    });

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        sawText = true;
        yield text;
      }

      const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (groundingChunks?.length) {
        sources = groundingChunks
          .map((c) => c.web)
          .filter((web): web is { uri: string; title?: string } => Boolean(web?.uri))
          .map((web) => ({ uri: web.uri, title: web.title?.trim() || hostnameOf(web.uri) }));
      }
    }
  } catch (err) {
    console.error("[gemini] search-grounded request failed:", err);
    throw new Error("The AI assistant is temporarily unavailable. Please try again in a moment.");
  }

  if (!sawText) {
    throw new Error("The assistant returned an empty response.");
  }

  if (sources.length > 0) {
    options.onSources?.(dedupeSources(sources));
  }
}

function hostnameOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function dedupeSources(sources: WebSource[]): WebSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.uri) ? false : (seen.add(s.uri), true)));
}

/**
 * Code execution uses `@google/genai` (the same SDK as search grounding
 * above) rather than the older `@google/generative-ai` — both SDKs type
 * `CodeExecutionTool` fully, but `@google/generative-ai`'s streaming parser
 * was verified in manual testing to throw "Failed to parse stream" once a
 * response includes a code-execution result with substantial printed
 * output, discarding an otherwise-successful reply. `@google/genai`'s
 * streaming held up in the same test.
 *
 * The one thing that can't reuse the default path above is reading the
 * response: a plain `.text` getter only concatenates text parts and
 * silently drops anything else, which would throw away exactly the code,
 * its output, and any generated chart — so this walks
 * `candidates[0].content.parts` itself and turns each part type into
 * markdown, all fed through the same plain-string `yield` the rest of the
 * app expects. A generated chart becomes an ordinary markdown image with an
 * embedded data URI — MessageContent's existing markdown renderer displays
 * it with no new client-side code at all.
 */
async function* streamCodeExecutionReply(
  apiKey: string,
  modelName: string,
  systemInstruction: string,
  contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[]
): AsyncGenerator<string, void, unknown> {
  const ai = new GoogleGenAI({ apiKey });

  let sawText = false;

  try {
    const stream = await ai.models.generateContentStream({
      model: modelName,
      contents,
      config: { systemInstruction, tools: [{ codeExecution: {} }] },
    });

    for await (const chunk of stream) {
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.text) {
          sawText = true;
          yield part.text;
        } else if (part.executableCode?.code) {
          sawText = true;
          yield `\n\n\`\`\`python\n${part.executableCode.code.trim()}\n\`\`\`\n`;
        } else if (part.codeExecutionResult?.output) {
          sawText = true;
          yield `\n\`\`\`\nOutput: ${part.codeExecutionResult.output.trim()}\n\`\`\`\n`;
        } else if (part.inlineData?.mimeType?.startsWith("image/") && part.inlineData.data) {
          sawText = true;
          yield `\n\n![Generated chart](data:${part.inlineData.mimeType};base64,${part.inlineData.data})\n\n`;
        }
      }
    }
  } catch (err) {
    console.error("[gemini] code-execution request failed:", err);
    throw new Error("The AI assistant is temporarily unavailable. Please try again in a moment.");
  }

  if (!sawText) {
    throw new Error("The assistant returned an empty response.");
  }
}
