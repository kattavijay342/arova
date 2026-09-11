import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import { isValidUuid } from "@/lib/server/validation";
import { createAttachmentDownloadUrl } from "@/lib/server/storage";

/**
 * Returns a short-lived signed URL for the original file attached to a
 * message (see supabase/schema.sql's Phase 6 block and lib/server/storage.ts)
 * — the bucket itself is private, so this is the only way to read one back
 * out. Ownership is re-checked here against the message's own conversation
 * rather than trusted from the client, exactly like every other
 * single-message route.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");
  if (!isValidUuid(params.id)) return fail(400, "BAD_REQUEST", "Invalid message ID");

  const rl = checkRateLimit(`messages:attachment:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data: message, error } = await supabase
    .from("messages")
    .select("attachment_path, conversations!inner(user_id)")
    .eq("id", params.id)
    .eq("conversations.user_id", user.id)
    .maybeSingle();

  if (error) return failInternal("messages", error);
  if (!message) return fail(404, "NOT_FOUND", "Message not found");
  if (!message.attachment_path) return fail(404, "NOT_FOUND", "No file is attached to this message");

  const url = await createAttachmentDownloadUrl(supabase, message.attachment_path);
  if (!url) return fail(500, "INTERNAL_ERROR", "Could not generate a download link. Please try again.");

  return ok({ url });
}
