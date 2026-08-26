import { z } from "zod";
import { fail, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

const updateConversationSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(100, "Title is too long"),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid conversation ID");

  const rl = checkRateLimit(`conversations:get:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (convError) return fail(500, "INTERNAL_ERROR", convError.message);
  if (!conversation) return fail(404, "NOT_FOUND", "Conversation not found");

  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("*, message_feedback(rating)")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (msgError) return fail(500, "INTERNAL_ERROR", msgError.message);
  return ok({ ...conversation, messages });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid conversation ID");

  const rl = checkRateLimit(`conversations:update:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = updateConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({ title: parsed.data.title })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return fail(500, "INTERNAL_ERROR", error.message);
  if (!data) return fail(404, "NOT_FOUND", "Conversation not found");
  return ok(data);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid conversation ID");

  const rl = checkRateLimit(`conversations:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return fail(500, "INTERNAL_ERROR", error.message);
  if (!data) return fail(404, "NOT_FOUND", "Conversation not found");
  return ok({ deleted: true });
}
