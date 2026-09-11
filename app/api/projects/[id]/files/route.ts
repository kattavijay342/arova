import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import { extractDocumentText, DocumentExtractionError } from "@/lib/server/documentExtraction";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/document";
import { uploadAttachment } from "@/lib/server/storage";

const MAX_DOCUMENT_BASE64_CHARS = Math.ceil((MAX_DOCUMENT_BYTES * 4) / 3) + 1024;
const MAX_FILES_PER_PROJECT = 20;

const uploadFileSchema = z.object({
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  data: z.string().min(1, "File data is missing").max(MAX_DOCUMENT_BASE64_CHARS, "File is too large"),
  filename: z.string().trim().min(1).max(255),
});

async function getOwnedProject(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  projectId: string,
  userId: string
) {
  const { data, error } = await supabase!.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid project ID");

  const rl = checkRateLimit(`project-files:list:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  let project;
  try {
    project = await getOwnedProject(supabase, params.id, user.id);
  } catch (err) {
    return failInternal("project-files", err);
  }
  if (!project) return fail(404, "NOT_FOUND", "Project not found");

  const { data, error } = await supabase
    .from("project_files")
    .select("*")
    .eq("project_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return failInternal("project-files", error);
  return ok(data);
}

/**
 * Uploads a reference file for a project — extracted text is stored once
 * here and given to the AI as context on every conversation inside the
 * project (see lib/server/project.ts), unlike Phase 2's per-message
 * documents which only apply to the conversation they were sent in.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid project ID");

  const rl = checkRateLimit(`project-files:upload:${user.id}`, 10, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = uploadFileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }
  const { mimeType, data, filename } = parsed.data;

  const decodedBytes = Buffer.from(data, "base64").length;
  if (decodedBytes > MAX_DOCUMENT_BYTES) {
    return fail(400, "BAD_REQUEST", "File is too large. Maximum size is 10MB.");
  }

  let project;
  try {
    project = await getOwnedProject(supabase, params.id, user.id);
  } catch (err) {
    return failInternal("project-files", err);
  }
  if (!project) return fail(404, "NOT_FOUND", "Project not found");

  const { count, error: countError } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", params.id);

  if (countError) return failInternal("project-files", countError);
  if ((count ?? 0) >= MAX_FILES_PER_PROJECT) {
    return fail(400, "BAD_REQUEST", `This project has reached the limit of ${MAX_FILES_PER_PROJECT} files. Delete one first.`);
  }

  let extracted;
  try {
    extracted = await extractDocumentText(mimeType, Buffer.from(data, "base64"));
  } catch (err) {
    if (err instanceof DocumentExtractionError) return fail(400, "BAD_REQUEST", err.message);
    return fail(500, "INTERNAL_ERROR", "Could not process this file. Please try again.");
  }

  const { data: fileRow, error } = await supabase
    .from("project_files")
    .insert({
      project_id: params.id,
      filename,
      mime_type: mimeType,
      extracted_text: extracted.text,
      char_count: extracted.text.length,
      truncated: extracted.truncated,
    })
    .select()
    .single();

  if (error) return failInternal("project-files", error);

  // Keep the original file itself, not just its extracted text — see
  // lib/server/storage.ts. Best-effort: a failed upload here still leaves a
  // perfectly usable project file (its extracted text is already saved
  // above), just without a downloadable original.
  const path = await uploadAttachment(
    supabase,
    user.id,
    `projects/${params.id}/${fileRow.id}`,
    filename,
    Buffer.from(data, "base64"),
    mimeType
  );
  if (path) {
    const { data: updated } = await supabase
      .from("project_files")
      .update({ storage_path: path })
      .eq("id", fileRow.id)
      .select()
      .single();
    if (updated) return ok(updated, 201);
  }

  return ok(fileRow, 201);
}
