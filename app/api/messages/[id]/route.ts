import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

const editMessageSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(4000, "Message is too long"),
});

/** Confirms `messageId` belongs to a conversation owned by `userId`; returns its conversation/role/timestamp. */
async function getOwnedMessage(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  messageId: string,
  userId: string
) {
  const { data, error } = await supabase!
    .from("messages")
    .select("id, role, content, conversation_id, created_at, conversations!inner(user_id)")
    .eq("id", messageId)
    .eq("conversations.user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Edits a user message in place, then deletes every message that came after
 * it in the same conversation (this app has no branching/history-tree model,
 * so an edited question can't coexist with the now-stale answer that
 * followed it). The client follows this up with a normal send/retry call to
 * `/api/conversations/[id]/messages`, which recognizes the edited message as
 * an unanswered last user message and generates a fresh reply without
 * inserting a duplicate row.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid message ID");

  const rl = checkRateLimit(`messages:edit:${user.id}`, 20, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = editMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  let message;
  try {
    message = await getOwnedMessage(supabase, params.id, user.id);
  } catch (err) {
    return failInternal("messages", err);
  }
  if (!message) return fail(404, "NOT_FOUND", "Message not found");
  if (message.role !== "user") {
    return fail(400, "BAD_REQUEST", "Only your own messages can be edited");
  }

  const { data: updated, error: updateError } = await supabase!
    .from("messages")
    .update({ content: parsed.data.content })
    .eq("id", params.id)
    .select()
    .single();

  if (updateError) return failInternal("messages", updateError);

  // Remove every message that came after this one — it answered a question
  // that no longer exists in its original form.
  const { error: trimError } = await supabase!
    .from("messages")
    .delete()
    .eq("conversation_id", message.conversation_id)
    .gt("created_at", message.created_at);

  if (trimError) return failInternal("messages", trimError);

  return ok(updated);
}

/**
 * Deletes a message from a conversation the caller owns. This app has no
 * explicit parent/reply column linking a question to its answer (see
 * schema.sql) — every turn is exactly one user row immediately followed by
 * at most one assistant row (enforced by how /api/conversations/[id]/messages
 * and /api/conversations/[id]/images insert messages), so the assistant
 * reply "belonging to" a user question is identified positionally: the next
 * message in the conversation by created_at, if and only if that next
 * message is an assistant row. Deleting a user question therefore deletes
 * that paired reply too, so it can't become an orphan answer to a question
 * that no longer exists. Deleting an assistant message never touches the
 * preceding question (case 5 in the TC05 spec) — only the reverse direction
 * cascades.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid message ID");

  const rl = checkRateLimit(`messages:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  let message;
  try {
    message = await getOwnedMessage(supabase, params.id, user.id);
  } catch (err) {
    return failInternal("messages", err);
  }
  if (!message) return fail(404, "NOT_FOUND", "Message not found");

  const idsToDelete = [message.id];

  if (message.role === "user") {
    const { data: next, error: nextError } = await supabase!
      .from("messages")
      .select("id, role")
      .eq("conversation_id", message.conversation_id)
      .gt("created_at", message.created_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextError) return failInternal("messages", nextError);
    if (next && next.role === "assistant") {
      idsToDelete.push(next.id);
    }
  }

  // .select() (rather than a bare .delete()) so a row RLS silently blocked
  // comes back as an honest failure instead of a false "deleted: true" — a
  // bare delete reports success even when it removed zero rows.
  const { data: deleted, error } = await supabase!
    .from("messages")
    .delete()
    .in("id", idsToDelete)
    .select("id");

  if (error) return failInternal("messages", error);
  if (!deleted || deleted.length !== idsToDelete.length) {
    return fail(500, "INTERNAL_ERROR", "The message could not be deleted. Please try again.");
  }

  return ok({ deleted: true, deletedIds: idsToDelete });
}
