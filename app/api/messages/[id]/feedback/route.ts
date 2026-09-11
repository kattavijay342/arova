import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const submitFeedbackSchema = z.object({
  rating: z.enum(["up", "down"]),
  comment: z.string().trim().max(500, "Comment is too long").optional(),
});

/** Confirms `messageId` is an assistant message inside a conversation owned by `userId`. */
async function getOwnedAssistantMessage(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  messageId: string,
  userId: string
) {
  const { data, error } = await supabase!
    .from("messages")
    .select("id, role, conversations!inner(user_id)")
    .eq("id", messageId)
    .eq("conversations.user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`messages:feedback:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = submitFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  let message;
  try {
    message = await getOwnedAssistantMessage(supabase, params.id, user.id);
  } catch (err) {
    return failInternal("feedback", err);
  }
  if (!message) return fail(404, "NOT_FOUND", "Message not found");
  if (message.role !== "assistant") {
    return fail(400, "BAD_REQUEST", "Feedback can only be left on assistant messages");
  }

  const { data, error } = await supabase!
    .from("message_feedback")
    .upsert(
      {
        message_id: params.id,
        user_id: user.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      },
      { onConflict: "message_id,user_id" }
    )
    .select("rating, comment")
    .single();

  if (error) return failInternal("feedback", error);
  return ok(data);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`messages:feedback:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { error } = await supabase!
    .from("message_feedback")
    .delete()
    .eq("message_id", params.id)
    .eq("user_id", user.id);

  if (error) return failInternal("feedback", error);
  return ok({ deleted: true });
}
