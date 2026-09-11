import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import { createAttachmentDownloadUrl } from "@/lib/server/storage";

/** Mirrors app/api/messages/[id]/attachment/route.ts, for a project reference file's original upload instead of a chat message's. */
export async function GET(request: Request, { params }: { params: { id: string; fileId: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id) || !isValidUuid(params.fileId)) return fail(400, "BAD_REQUEST", "Invalid ID");

  const rl = checkRateLimit(`project-files:attachment:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  // Ownership flows through the project, same as DELETE on this file.
  const { data: project, error: projectError } = await supabase!
    .from("projects")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError) return failInternal("project-files", projectError);
  if (!project) return fail(404, "NOT_FOUND", "Project not found");

  const { data: file, error } = await supabase!
    .from("project_files")
    .select("storage_path")
    .eq("id", params.fileId)
    .eq("project_id", params.id)
    .maybeSingle();

  if (error) return failInternal("project-files", error);
  if (!file) return fail(404, "NOT_FOUND", "File not found");
  if (!file.storage_path) return fail(404, "NOT_FOUND", "No original file is available for this upload");

  const url = await createAttachmentDownloadUrl(supabase, file.storage_path);
  if (!url) return fail(500, "INTERNAL_ERROR", "Could not generate a download link. Please try again.");

  return ok({ url });
}
