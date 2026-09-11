import { z } from "zod";
import { fail, failInternal } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { streamAIReply, validateAIConfig } from "@/lib/server/aiProvider";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import { extractDocumentText, DocumentExtractionError } from "@/lib/server/documentExtraction";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES, buildDocumentBlock } from "@/lib/document";
import { stripGeneratedImageForHistory } from "@/lib/generatedImage";
import { buildSearchCitationsBlock, stripSearchCitationsForHistory, type WebSource } from "@/lib/searchCitations";
import {
  ALLOWED_DATASET_MIME_TYPES,
  MAX_DATASET_BYTES,
  MAX_EXTRACTED_CHARS,
  buildDatasetBlock,
  hasDatasetBlock,
  stripGeneratedChartsForHistory,
} from "@/lib/dataset";
import { getMemoryContext } from "@/lib/server/memory";
import { getCustomInstructions } from "@/lib/server/personalization";
import { getProjectContext } from "@/lib/server/project";
import { getStudyProgressContext } from "@/lib/server/studyProgress";
import { uploadAttachment } from "@/lib/server/storage";
import { matchesImageSignature } from "@/lib/server/fileSignature";
import type { Mode } from "@/lib/types";

// Kept in sync with the client-side allow-list in components/chat/MessageInput.tsx.
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"] as const;
const MAX_IMAGE_DECODED_BYTES = 4 * 1024 * 1024; // 4MB
// Base64 inflates size by ~4/3; cap the raw string well above the decoded
// limit so a malformed/oversized payload is rejected before decoding it.
const MAX_IMAGE_BASE64_CHARS = Math.ceil((MAX_IMAGE_DECODED_BYTES * 4) / 3) + 1024;
const MAX_DOCUMENT_BASE64_CHARS = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 1024;

const imageAttachmentSchema = z.object({
  kind: z.literal("image"),
  mimeType: z.enum(ALLOWED_IMAGE_MIME_TYPES),
  data: z.string().min(1, "Attachment data is missing").max(MAX_IMAGE_BASE64_CHARS, "Image is too large"),
});

const documentAttachmentSchema = z.object({
  kind: z.literal("document"),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  data: z.string().min(1, "Attachment data is missing").max(MAX_DOCUMENT_BASE64_CHARS, "File is too large"),
  filename: z.string().trim().min(1).max(255),
});

const MAX_DATASET_BASE64_CHARS = Math.ceil((MAX_DATASET_BYTES * 4) / 3) + 1024;

const datasetAttachmentSchema = z.object({
  kind: z.literal("dataset"),
  mimeType: z.enum(ALLOWED_DATASET_MIME_TYPES),
  data: z.string().min(1, "Attachment data is missing").max(MAX_DATASET_BASE64_CHARS, "File is too large"),
  filename: z.string().trim().min(1).max(255),
});

const attachmentSchema = z.discriminatedUnion("kind", [imageAttachmentSchema, documentAttachmentSchema, datasetAttachmentSchema]);

const sendMessageSchema = z
  .object({
    content: z.string().trim().max(4000, "Message is too long"),
    attachment: attachmentSchema.optional(),
    webSearch: z.boolean().optional(),
    deepResearch: z.boolean().optional(),
    jobFitAnalysis: z.boolean().optional(),
  })
  .refine((v) => v.content.length > 0 || v.attachment !== undefined, {
    message: "Message cannot be empty",
    path: ["content"],
  });

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Streams the AI reply progressively instead of waiting for the full
 * completion. The response body is newline-delimited JSON (one event object
 * per line) rather than a single JSON payload:
 *   {"type":"chunk","delta":"..."}   — zero or more, as text is generated
 *   {"type":"done","assistantMessage":{...}}  — once, on success
 *   {"type":"error","code":"...","message":"..."}  — once, on failure
 *
 * Everything up to this point (auth, rate limit, validation, AI config
 * check, fetching the conversation, the user-message insert / retry dedup)
 * still happens before any streaming starts, so those failures are still
 * plain JSON error responses with the right HTTP status — exactly as
 * before. Only the AI-generation step itself streams, because once bytes
 * start flowing the HTTP status can no longer change.
 *
 * Document attachments (PDF/DOCX/TXT/MD): unlike an image, which is sent to
 * Gemini as an inline part for this turn only and never persisted, a
 * document's text is extracted here and embedded into the *persisted*
 * message content (see lib/document.ts's buildDocumentBlock). That's what
 * makes it "conversation-aware" — the extracted text is naturally replayed
 * as part of `history` on every later turn, the same way any other message
 * content already is, with no separate storage or retrieval step needed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid conversation ID");

  // Tightest limit of any route — this is the one that hits the AI model.
  // Keyed by user id (not client IP): the IP is read from the
  // client-controlled X-Forwarded-For header, so an IP-keyed limit here can
  // be reset on every request just by sending a different fake value for
  // that header, completely bypassing the limit on the route that costs the
  // most (it calls the paid Gemini API on every hit).
  const rl = checkRateLimit(`messages:send:${user.id}`, 15, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }
  const { content, attachment } = parsed.data;
  // Search grounding (plain or deep-research) and an inline multimodal
  // attachment are mutually exclusive (see lib/server/gemini.ts) — the UI
  // already enforces this by disabling one control while the other is
  // active, this is the server-side backstop.
  const webSearch = parsed.data.webSearch && !attachment;
  const deepResearch = parsed.data.deepResearch && !attachment;

  if (deepResearch) {
    // Deep research asks the model for a long, multi-source report — a
    // meaningfully heavier request than a normal reply or even a plain
    // grounded search, so it gets its own, tighter limit on top of the
    // general one above.
    const drRl = checkRateLimit(`messages:deep-research:${user.id}`, 5, 15 * 60_000);
    if (!drRl.ok) return fail(429, "RATE_LIMITED", `Too many deep research requests. Try again in ${drRl.retryAfterSeconds}s.`);
  }

  // Zod only checked the base64 string's length; verify the actual decoded
  // byte size server-side, since base64 padding/whitespace can skew that
  // estimate — never trust the client's reported size.
  if (attachment) {
    const decodedBuffer = Buffer.from(attachment.data, "base64");
    if (attachment.kind === "image" && decodedBuffer.length > MAX_IMAGE_DECODED_BYTES) {
      return fail(400, "BAD_REQUEST", "Image is too large. Maximum size is 4MB.");
    }
    if (attachment.kind === "document" && decodedBuffer.length > MAX_DOCUMENT_BYTES) {
      return fail(400, "BAD_REQUEST", "File is too large. Maximum size is 10MB.");
    }
    if (attachment.kind === "dataset" && decodedBuffer.length > MAX_DATASET_BYTES) {
      return fail(400, "BAD_REQUEST", "File is too large. Maximum size is 10MB.");
    }
    // The declared `mimeType` above is only ever checked against an
    // allow-list of strings — never that the bytes actually are what they
    // claim to be. An image is the one attachment kind where that matters:
    // it's never parsed server-side (unlike a document, where a real
    // PDF/DOCX parser would already reject mismatched bytes), so a
    // mislabeled file would otherwise sail straight through to Gemini and
    // Storage. See lib/server/fileSignature.ts.
    if (attachment.kind === "image" && !matchesImageSignature(decodedBuffer, attachment.mimeType)) {
      return fail(400, "BAD_REQUEST", "This file doesn't look like a valid image. Please try a different file.");
    }
  }

  // Extract the document's text up front — before touching the database —
  // so a corrupted/unreadable file fails cleanly instead of leaving a user
  // message inserted with no way to generate a reply for it.
  let finalContent = content;
  if (attachment?.kind === "document") {
    try {
      const buffer = Buffer.from(attachment.data, "base64");
      const { text, truncated } = await extractDocumentText(attachment.mimeType, buffer);
      const block = buildDocumentBlock(
        { filename: attachment.filename, mimeType: attachment.mimeType, charCount: text.length, truncated },
        text
      );
      finalContent = content ? `${content}\n\n${block}` : block;
    } catch (err) {
      if (err instanceof DocumentExtractionError) {
        return fail(400, "BAD_REQUEST", err.message);
      }
      return fail(500, "INTERNAL_ERROR", "Could not process this file. Please try again.");
    }
  }

  // A dataset needs no real "extraction" — a CSV already is plain text —
  // just decode and cap it the same way a document's extracted text is
  // capped, so a huge file can't blow up every later turn's context.
  if (attachment?.kind === "dataset") {
    const raw = Buffer.from(attachment.data, "base64").toString("utf-8").trim();
    if (!raw) {
      return fail(400, "BAD_REQUEST", "This file appears to be empty.");
    }
    const truncated = raw.length > MAX_EXTRACTED_CHARS;
    // Cut at the last complete line, not a raw character offset — a CSV
    // sliced mid-row leaves a malformed final line (a partial value with no
    // closing column) that makes pandas' read_csv either throw a
    // ParserError or silently misparse the row, corrupting the very
    // analysis the user asked for.
    const lastNewline = raw.lastIndexOf("\n", MAX_EXTRACTED_CHARS);
    const csvText = truncated ? raw.slice(0, lastNewline > 0 ? lastNewline : MAX_EXTRACTED_CHARS) : raw;
    const block = buildDatasetBlock({ filename: attachment.filename, mimeType: attachment.mimeType }, csvText, truncated);
    finalContent = content ? `${content}\n\n${block}` : block;
  }

  // Fail fast on a missing Gemini API key, before touching the database.
  try {
    validateAIConfig();
  } catch (err) {
    return fail(500, "AI_CONFIG_ERROR", err instanceof Error ? err.message : "AI is not configured.");
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*, messages(*)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convError) return failInternal("messages", convError);
  if (!conversation) return fail(404, "NOT_FOUND", "Conversation not found");

  const sortedMessages = [...conversation.messages].sort(
    (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)
  );

  // Retry support: if the last message is an unanswered user message with
  // this exact content, reuse it instead of inserting a duplicate — this
  // happens when a previous attempt saved the user message but the AI call
  // then failed, and the client retries with the same text (and, for a
  // document, the same file — re-extracting it here reproduces the same
  // finalContent, so the dedup check below still recognizes it as a retry).
  const last = sortedMessages[sortedMessages.length - 1];
  const isRetry = last?.role === "user" && last.content === finalContent;

  const priorMessages = isRetry ? sortedMessages.slice(0, -1) : sortedMessages;
  const isFirstMessage = priorMessages.length === 0;

  // The row this turn's user message actually is in the database — either
  // the one just inserted, or (on retry) the existing unanswered one. Sent
  // back to the client below (before the AI call, so it arrives even if
  // that call then fails) so it can reconcile the temp client-generated id
  // its optimistic bubble was added under with the real one — without this,
  // Edit/Delete/feedback on a message sent this session (never reloaded
  // from the server) would address an id that was never a real row.
  let persistedUserMessage: { id: string; content: string; created_at: string; attachment_path?: string | null };

  if (!isRetry) {
    const { data: insertedUserMessage, error: userMsgError } = await supabase
      .from("messages")
      .insert({ conversation_id: params.id, role: "user", content: finalContent })
      .select()
      .single();

    if (userMsgError) return failInternal("messages", userMsgError);
    persistedUserMessage = insertedUserMessage;

    // Keep the original file itself, not just its extracted text, so the
    // user can get back exactly what they sent later (see
    // lib/server/storage.ts) — for an image, this is also what makes it
    // viewable again at all after a reload: the base64 data itself is only
    // ever sent to Gemini as an inline part for this turn and never added
    // to `content` (unlike a document/dataset, which embeds extracted
    // text), so without this, a reloaded conversation showed no trace an
    // image was ever attached to that message. Never re-uploaded on a
    // retry: this branch only runs for a genuinely new row. An
    // `ImageAttachment` has no `filename` (unlike document/dataset) since
    // the picker never collects one for a photo — synthesized here purely
    // as a storage key, never shown to the user.
    if (attachment) {
      const filename =
        attachment.kind === "image" ? `image.${attachment.mimeType.split("/")[1] ?? "bin"}` : attachment.filename;
      const buffer = Buffer.from(attachment.data, "base64");
      const path = await uploadAttachment(
        supabase,
        user.id,
        `${params.id}/${persistedUserMessage.id}`,
        filename,
        buffer,
        attachment.mimeType
      );
      if (path) {
        const { data: updated } = await supabase
          .from("messages")
          .update({ attachment_path: path, attachment_filename: filename, attachment_mime_type: attachment.mimeType })
          .eq("id", persistedUserMessage.id)
          .select()
          .single();
        if (updated) persistedUserMessage = updated;
      }
    }
  } else {
    persistedUserMessage = last;
  }

  // Code execution stays enabled for the rest of the conversation once a
  // dataset has been uploaded, not just on the turn it was attached — a
  // follow-up question like "now show me the average of column X" needs it
  // too, and the CSV's text is still right there in `history` either way.
  const hasDataset =
    attachment?.kind === "dataset" || priorMessages.some((m: { content: string }) => hasDatasetBlock(m.content));

  if (hasDataset) {
    // Writing and running code on every turn is heavier than a normal reply
    // (and, for a fresh upload, than even a plain grounded search) — its own
    // tighter limit on top of the general one above.
    const daRl = checkRateLimit(`messages:data-analysis:${user.id}`, 10, 10 * 60_000);
    if (!daRl.ok) return fail(429, "RATE_LIMITED", `Too many data analysis requests. Try again in ${daRl.retryAfterSeconds}s.`);
  }

  // Job-fit analysis is Career mode only (enforced here, not just hidden in
  // the UI) and, unlike webSearch/deepResearch, is compatible with a
  // document attachment (the resume) — only a dataset forces the separate
  // code-execution tool path, which takes priority in lib/server/gemini.ts.
  const jobFitAnalysis = Boolean(parsed.data.jobFitAnalysis) && conversation.mode === "career" && !hasDataset;

  // A prior turn that generated an image embeds its base64 bytes directly in
  // `content` (see lib/generatedImage.ts) — replaced with a short
  // placeholder here so a multi-hundred-KB image is never resent as "text"
  // context on every later message in the conversation. A prior turn's cited
  // sources (see lib/searchCitations.ts), and any chart a code-execution
  // turn generated (see lib/dataset.ts), are dropped/replaced the same way.
  const history = priorMessages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: stripGeneratedChartsForHistory(stripSearchCitationsForHistory(stripGeneratedImageForHistory(m.content))),
  }));

  // Only an image is sent to Gemini as an inline multimodal part — a
  // document's text is already folded into `finalContent` above.
  const imageAttachment = attachment?.kind === "image" ? attachment : undefined;

  // Facts the user explicitly asked to be remembered (see lib/server/memory.ts)
  // — null if they have memory turned off or haven't saved anything.
  const memoryContext = await getMemoryContext(supabase, user.id);

  // The user's global "about me" / "how to respond" preferences (see
  // lib/server/personalization.ts) — null if they haven't set either.
  const customInstructions = await getCustomInstructions(supabase, user.id);

  // This conversation's project instructions/files, if it belongs to one
  // (see lib/server/project.ts) — null for an ungrouped conversation.
  const projectContext = await getProjectContext(supabase, conversation.project_id ?? null);

  // Past practice-quiz subjects/scores, to calibrate a new quiz's difficulty
  // (see lib/server/studyProgress.ts) — Student mode only, null otherwise or
  // if the student hasn't completed a quiz yet.
  const studyProgressContext =
    conversation.mode === "student" ? await getStudyProgressContext(supabase, user.id) : null;

  // A typed-nothing-but-attached-a-file first message still deserves a
  // real conversation title instead of an empty one.
  const titleSource =
    content ||
    (attachment?.kind === "document" || attachment?.kind === "dataset"
      ? attachment.filename
      : attachment?.kind === "image"
        ? "Image"
        : "");

  const encoder = new TextEncoder();
  // The incoming request's own abort signal — fires both when the client
  // explicitly clicks "Stop generating" (aborting its fetch) and when it
  // simply disconnects. Passed down to the Gemini call so the upstream
  // request is actually cancelled instead of running to completion for a
  // connection nobody is reading anymore, and checked below to decide
  // whether to still persist whatever text was generated before the stop.
  const signal = request.signal;

  const stream = new ReadableStream({
    async start(controller) {
      // Once the client is gone, `controller.enqueue()` throws — this
      // becomes a no-op after that instead of letting that throw escape
      // (it would otherwise reach the `catch` below and throw again trying
      // to report the very error it just caused).
      let clientGone = false;
      function send(event: object) {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          clientGone = true;
        }
      }
      function closeStream() {
        if (clientGone) return;
        clientGone = true;
        try {
          controller.close();
        } catch {
          // Already closed/errored from the client's side — nothing to do.
        }
      }

      // Sent before the AI call so the client can reconcile its optimistic
      // message's temp id even if generation then fails.
      send({ type: "user_message", message: persistedUserMessage });

      let full = "";
      let sources: WebSource[] = [];
      try {
        for await (const delta of streamAIReply(conversation.mode as Mode, finalContent, history, {
          attachment: imageAttachment,
          memoryContext: memoryContext ?? undefined,
          customInstructions: customInstructions ?? undefined,
          projectContext: projectContext ?? undefined,
          studyProgressContext: studyProgressContext ?? undefined,
          webSearch,
          deepResearch,
          codeExecution: hasDataset,
          jobFitAnalysis,
          signal,
          onSources: (cited) => {
            sources = cited;
          },
        })) {
          full += delta;
          send({ type: "chunk", delta });
        }
      } catch (err) {
        // The user's message is already saved — the client's retry flow
        // resends the same text, which the dedup check above turns into a
        // plain retry rather than a duplicate row. (A client-initiated stop
        // never reaches this branch — streamAIReply ends cleanly on abort
        // instead of throwing; see lib/server/gemini.ts.)
        send({
          type: "error",
          code: "AI_REQUEST_FAILED",
          message: err instanceof Error ? err.message : "The assistant failed to respond",
        });
        closeStream();
        return;
      }

      if (!full.trim()) {
        // Stopped before any text was generated — nothing worth saving as a
        // reply. The user's question stays saved either way.
        if (!signal.aborted) {
          send({ type: "error", code: "INTERNAL_ERROR", message: "The assistant returned an empty response." });
        }
        closeStream();
        return;
      }

      const finalReply = sources.length > 0 ? full + buildSearchCitationsBlock(sources, deepResearch) : full;

      // Persisted unconditionally — including when the client already
      // disconnected (a "Stop generating" click, or a dropped connection) —
      // so a stopped reply is never silently lost. Only ever skipped above
      // when there's literally no text to save.
      const { data: assistantMessage, error: assistantMsgError } = await supabase
        .from("messages")
        .insert({ conversation_id: params.id, role: "assistant", content: finalReply })
        .select()
        .single();

      if (assistantMsgError) {
        console.error("[messages]", assistantMsgError.message);
        send({ type: "error", code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." });
        closeStream();
        return;
      }

      await supabase
        .from("conversations")
        .update({ title: isFirstMessage ? truncate(titleSource, 38) : conversation.title })
        .eq("id", params.id);

      // A no-op `send` if the client is already gone (stopped/disconnected)
      // — the persisted row above is what actually matters at that point;
      // the client reconciles it on its own via a follow-up fetch instead
      // (see ChatContext's stop-generation handling).
      send({ type: "done", assistantMessage });
      closeStream();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
