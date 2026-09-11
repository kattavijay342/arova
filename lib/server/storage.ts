import type { getSessionUser } from "./requireUser";

// The single private bucket created in supabase/schema.sql — every object
// in it lives under `<user_id>/...`, which is exactly what that bucket's
// RLS policies check, so every call here must be given (or must construct)
// a path starting with the caller's own id.
const BUCKET = "attachments";

type SupabaseClient = Awaited<ReturnType<typeof getSessionUser>>["supabase"];

/**
 * `filename` is user-controlled (the original file's name) and must never
 * be used verbatim in a storage path — an embedded "/" would inject extra
 * path segments, and "../" segments could otherwise be used to try to
 * escape the intended folder. Neither can cross into another user's
 * folder (the bucket's RLS policies fix the *first* segment to the
 * caller's own auth.uid(), which this code sets independently below) but
 * both would still be an unnecessary correctness/robustness gap for no
 * benefit, so this collapses any path-like characters to "_" before the
 * name is used as a storage key. Display use (the filename shown in the UI,
 * or offered as the download's suggested filename) always uses the
 * original, unsanitized value from the database — only the storage key
 * itself is sanitized.
 */
function sanitizeFilenameForPath(filename: string): string {
  return filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_").slice(-200);
}

/**
 * Uploads a file's original bytes to the private `attachments` bucket, so
 * the user can get back exactly what they uploaded later — not just its
 * extracted text (see supabase/schema.sql's Phase 6 block for why this
 * exists). `subPath` must be a server-generated, already-trusted path
 * segment (e.g. `${conversationId}/${messageId}`) — never built from
 * user-controlled input directly.
 *
 * Returns the storage path to persist on the owning row, or null if the
 * upload failed. Failing to keep the original file is logged but never
 * thrown — the extracted text (already persisted separately) is what the
 * chat experience actually depends on, so losing the original shouldn't
 * fail the whole send.
 */
export async function uploadAttachment(
  supabase: SupabaseClient,
  userId: string,
  subPath: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<string | null> {
  const path = `${userId}/${subPath}/${sanitizeFilenameForPath(filename)}`;
  const { error } = await supabase!.storage.from(BUCKET).upload(path, buffer, { contentType: mimeType, upsert: false });
  if (error) {
    console.error("[storage] failed to upload attachment:", error.message);
    return null;
  }
  return path;
}

/**
 * Creates a short-lived signed URL for downloading a previously-uploaded
 * attachment — the bucket is private, so this is the only way to read an
 * object back out of it; the caller must already have verified the current
 * user owns the row this path came from before calling this (see
 * app/api/messages/[id]/attachment/route.ts and the project-files
 * equivalent). 5 minutes by default — long enough that a passively-rendered
 * image (see components/chat/PersistedImageAttachment.tsx) or a slow click
 * to download doesn't expire mid-use, short enough to still be a genuinely
 * temporary link rather than a durable public one.
 */
export async function createAttachmentDownloadUrl(
  supabase: SupabaseClient,
  path: string,
  expiresInSeconds = 300
): Promise<string | null> {
  const { data, error } = await supabase!.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("[storage] failed to create signed URL:", error.message);
    return null;
  }
  return data.signedUrl;
}
