import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { getGeminiEnv } from "@/lib/server/aiEnv";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import { generateImage, ImageGenerationError } from "@/lib/server/imageGeneration";
import { buildGeneratedImageBlock } from "@/lib/generatedImage";
import { uploadAttachment } from "@/lib/server/storage";

const generateImageSchema = z.object({
  prompt: z.string().trim().min(1, "Describe the image you want to generate").max(2000, "Prompt is too long"),
});

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Generates one image from a prompt and persists it as an assistant message
 * (see lib/generatedImage.ts for how it's embedded into `content`). A
 * separate, plain JSON (non-streaming) endpoint rather than an extension of
 * `/messages` — image generation returns one atomic result, not a token
 * stream, so there's nothing to stream, and keeping it separate avoids
 * adding a second, unrelated response shape to that already-complex route.
 *
 * "Regenerate" (client-side) is just calling this again with the same
 * prompt — this app has no branching/history-tree model, so a regenerated
 * image becomes a new turn rather than replacing the old one in place,
 * exactly like a normal follow-up message would.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid conversation ID");

  // Image generation is assumed to be more expensive/tightly-quota'd on
  // Google's side than text generation — kept tighter than the 15/60s on
  // /messages accordingly.
  const rl = checkRateLimit(`images:generate:${user.id}`, 10, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = generateImageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }
  const { prompt } = parsed.data;

  try {
    getGeminiEnv();
  } catch (err) {
    return fail(500, "AI_CONFIG_ERROR", err instanceof Error ? err.message : "AI is not configured.");
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*, messages(*)")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convError) return failInternal("images", convError);
  if (!conversation) return fail(404, "NOT_FOUND", "Conversation not found");

  const sortedMessages = [...conversation.messages].sort(
    (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)
  );
  const isFirstMessage = sortedMessages.length === 0;

  // Retry dedup (same pattern as /messages): if the last message is this
  // exact unanswered prompt, don't insert a duplicate row.
  const last = sortedMessages[sortedMessages.length - 1];
  const isRetry = last?.role === "user" && last.content === prompt;

  if (!isRetry) {
    const { error: userMsgError } = await supabase
      .from("messages")
      .insert({ conversation_id: params.id, role: "user", content: prompt });
    if (userMsgError) return failInternal("images", userMsgError);
  }

  let result;
  try {
    result = await generateImage(prompt);
  } catch (err) {
    // The prompt is already saved — the client can let the user retry,
    // which the dedup check above will treat as a plain retry rather than
    // inserting a duplicate.
    if (err instanceof ImageGenerationError) {
      return fail(422, "IMAGE_GENERATION_FAILED", err.message);
    }
    return fail(500, "INTERNAL_ERROR", "Could not generate the image. Please try again.");
  }

  // Kept in Storage rather than embedded as base64 in `content` — the same
  // reasoning as a user-uploaded attachment (see supabase/schema.sql's
  // Phase 6 block), just for the assistant's side: a generated image can
  // easily be several hundred KB of base64 *text*, which used to get
  // re-transferred in full every time this conversation was opened, even
  // though nothing renders it until this exact bubble scrolls into view.
  const block = buildGeneratedImageBlock({ prompt, mimeType: result.mimeType });
  const assistantContent = result.text ? `${result.text}\n\n${block}` : block;

  const { data: insertedMessage, error: assistantMsgError } = await supabase
    .from("messages")
    .insert({ conversation_id: params.id, role: "assistant", content: assistantContent })
    .select()
    .single();

  if (assistantMsgError) return failInternal("images", assistantMsgError);

  let assistantMessage = insertedMessage;
  const buffer = Buffer.from(result.data, "base64");
  const filename = `generated-image.${result.mimeType.split("/")[1] ?? "png"}`;
  const path = await uploadAttachment(supabase, user.id, `${params.id}/${insertedMessage.id}`, filename, buffer, result.mimeType);

  if (path) {
    const { data: updated } = await supabase
      .from("messages")
      .update({ attachment_path: path, attachment_filename: filename, attachment_mime_type: result.mimeType })
      .eq("id", insertedMessage.id)
      .select()
      .single();
    if (updated) assistantMessage = updated;
  } else {
    // Storage failed (most likely: the bucket hasn't been created yet — see
    // supabase/schema.sql) — fall back to embedding the image directly in
    // `content` so it's never silently lost, exactly the shape every
    // already-generated image already used before Storage existed.
    const fallbackBlock = buildGeneratedImageBlock({ prompt, mimeType: result.mimeType }, result.data);
    const fallbackContent = result.text ? `${result.text}\n\n${fallbackBlock}` : fallbackBlock;
    const { data: updated } = await supabase
      .from("messages")
      .update({ content: fallbackContent })
      .eq("id", insertedMessage.id)
      .select()
      .single();
    if (updated) assistantMessage = updated;
  }

  await supabase
    .from("conversations")
    .update({ title: isFirstMessage ? truncate(prompt, 38) : conversation.title })
    .eq("id", params.id);

  return ok(assistantMessage, 201);
}
