import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

export async function DELETE(request: Request, { params }: { params: { id: string; fileId: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id) || !isValidUuid(params.fileId)) return fail(400, "BAD_REQUEST", "Invalid ID");

  const rl = checkRateLimit(`project-files:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  // Ownership flows through the project (RLS also enforces this — see
  // schema.sql's "Users can view/delete files in their own projects").
  const { data: project, error: projectError } = await supabase!
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError) return failInternal("project-files", projectError);
  if (!project) return fail(404, "NOT_FOUND", "Project not found");

  const { data: deleted, error } = await supabase!
    .from("project_files")
    .delete()
    .eq("id", params.fileId)
    .eq("project_id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return failInternal("project-files", error);
  if (!deleted) return fail(404, "NOT_FOUND", "File not found");

  return ok({ deleted: true });
}
