import { z } from "zod";
import { fail } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { streamAIReply, validateAIConfig } from "@/lib/server/aiProvider";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import type { Mode } from "@/lib/types";

const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(4000, "Message is too long"),
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
  const { content } = parsed.data;

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

  if (convError) return fail(500, "INTERNAL_ERROR", convError.message);
  if (!conversation) return fail(404, "NOT_FOUND", "Conversation not found");

  const sortedMessages = [...conversation.messages].sort(
    (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)
  );

  // Retry support: if the last message is an unanswered user message with
  // this exact content, reuse it instead of inserting a duplicate — this
  // happens when a previous attempt saved the user message but the AI call
  // then failed, and the client retries with the same text.
  const last = sortedMessages[sortedMessages.length - 1];
  const isRetry = last?.role === "user" && last.content === content;

  const priorMessages = isRetry ? sortedMessages.slice(0, -1) : sortedMessages;
  const isFirstMessage = priorMessages.length === 0;

  if (!isRetry) {
    const { error: userMsgError } = await supabase
      .from("messages")
      .insert({ conversation_id: params.id, role: "user", content });

    if (userMsgError) return fail(500, "INTERNAL_ERROR", userMsgError.message);
  }

  const history = priorMessages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }

      let full = "";
      try {
        for await (const delta of streamAIReply(conversation.mode as Mode, content, history)) {
          full += delta;
          send({ type: "chunk", delta });
        }
      } catch (err) {
        // The user's message is already saved — the client's retry flow
        // resends the same text, which the dedup check above turns into a
        // plain retry rather than a duplicate row.
        send({
          type: "error",
          code: "AI_REQUEST_FAILED",
          message: err instanceof Error ? err.message : "The assistant failed to respond",
        });
        controller.close();
        return;
      }

      const { data: assistantMessage, error: assistantMsgError } = await supabase
        .from("messages")
        .insert({ conversation_id: params.id, role: "assistant", content: full })
        .select()
        .single();

      if (assistantMsgError) {
        send({ type: "error", code: "INTERNAL_ERROR", message: assistantMsgError.message });
        controller.close();
        return;
      }

      await supabase
        .from("conversations")
        .update({ title: isFirstMessage ? truncate(content, 38) : conversation.title })
        .eq("id", params.id);

      send({ type: "done", assistantMessage });
      controller.close();
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
