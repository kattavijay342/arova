import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";

const updateProjectSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100, "Name is too long").optional(),
  instructions: z.string().max(4000, "Instructions are too long").optional(),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid project ID");

  const rl = checkRateLimit(`projects:get:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError) return failInternal("projects", projectError);
  if (!project) return fail(404, "NOT_FOUND", "Project not found");

  const [{ data: conversations, error: convError }, { data: files, error: filesError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .eq("project_id", params.id)
      .order("updated_at", { ascending: false }),
    supabase.from("project_files").select("*").eq("project_id", params.id).order("created_at", { ascending: false }),
  ]);

  if (convError) return failInternal("projects", convError);
  if (filesError) return failInternal("projects", filesError);

  return ok({ ...project, conversations: conversations ?? [], files: files ?? [] });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid project ID");

  const rl = checkRateLimit(`projects:update:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = updateProjectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }
  if (parsed.data.name === undefined && parsed.data.instructions === undefined) {
    return fail(400, "BAD_REQUEST", "Nothing to update");
  }

  const { data, error } = await supabase
    .from("projects")
    .update(parsed.data)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) return failInternal("projects", error);
  if (!data) return fail(404, "NOT_FOUND", "Project not found");
  return ok(data);
}

/** Deleting a project never deletes its conversations — `conversations.project_id` is `on delete set null`, so they just become ungrouped again. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid project ID");

  const rl = checkRateLimit(`projects:delete:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return failInternal("projects", error);
  if (!data) return fail(404, "NOT_FOUND", "Project not found");
  return ok({ deleted: true });
}
