import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

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
