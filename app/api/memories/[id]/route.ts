import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

const updateMemorySchema = z.object({
  content: z.string().trim().min(1, "Enter something to remember").max(500, "Keep it under 500 characters"),
});

/** Edits a saved memory's text in place — previously the only way to change one was delete-and-re-add. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid memory ID");

  const rl = checkRateLimit(`memories:edit:${user.id}`, 20, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = updateMemorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  const { data: updated, error } = await supabase
    .from("user_memories")
    .update({ content: parsed.data.content })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return failInternal("memories", error);
  if (!updated) return fail(404, "NOT_FOUND", "Memory not found");

  return ok(updated);
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid memory ID");

  const rl = checkRateLimit(`memories:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  // .select().maybeSingle() (rather than a bare .delete()) so a row RLS
  // silently blocked comes back as an honest failure instead of a false
  // "deleted: true" — a bare delete reports success even when it removed
  // zero rows (e.g. a memory belonging to a different user).
  const { data: deleted, error } = await supabase
    .from("user_memories")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return failInternal("memories", error);
  if (!deleted) return fail(404, "NOT_FOUND", "Memory not found");

  return ok({ deleted: true });
}
