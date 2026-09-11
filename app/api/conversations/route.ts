import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const createConversationSchema = z.object({
  mode: z.enum(["student", "career", "general"]),
  projectId: z.string().uuid().optional(),
});

// Escapes Postgres ILIKE wildcards so a literal "%" or "_" typed into search
// is matched literally instead of acting as a pattern wildcard.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Lightweight by default (no messages) — the list only needs id/title/mode/
 * timestamps to render the sidebar. This used to eagerly join every
 * message of every conversation (`messages(*, message_feedback(rating))`),
 * which meant loading the app transferred the *entire* message history of
 * every conversation — including any embedded generated-image base64 data —
 * on every single page load. A conversation's actual messages are now
 * fetched on demand when it's opened (GET /api/conversations/[id], unchanged).
 *
 * `?q=` runs a real server-side search across both conversation titles and
 * message content — replacing what used to be a client-side filter over
 * that same eagerly-loaded (and now removed) message data, so search
 * behavior is unchanged even though the data is no longer loaded up front.
 * Scoped to ungrouped (non-project) conversations only, matching the
 * sidebar's existing search scope exactly.
 */
export async function GET(request: Request) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`conversations:list:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const q = new URL(request.url).searchParams.get("q")?.trim();

  let query = supabase.from("conversations").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;

    const { data: titleMatches, error: titleError } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .is("project_id", null)
      .ilike("title", pattern);
    if (titleError) return failInternal("conversations", titleError);

    const { data: contentMatches, error: contentError } = await supabase
      .from("messages")
      .select("conversation_id, conversations!inner(user_id, project_id)")
      .eq("conversations.user_id", user.id)
      .is("conversations.project_id", null)
      .ilike("content", pattern);
    if (contentError) return failInternal("conversations", contentError);

    const matchingIds = Array.from(
      new Set([
        ...(titleMatches ?? []).map((r) => r.id),
        ...(contentMatches ?? []).map((r) => r.conversation_id),
      ])
    );

    if (matchingIds.length === 0) return ok([]);
    query = query.in("id", matchingIds);
  }

  const { data, error } = await query;

  if (error) return failInternal("conversations", error);
  return ok(data);
}

export async function POST(request: Request) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`conversations:create:${user.id}`, 20, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = createConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  // Verify the project is actually the caller's own before linking a new
  // conversation to it — RLS on `conversations` only checks the
  // conversation row's own `user_id`, not that a supplied `project_id`
  // points to a project owned by the same user.
  if (parsed.data.projectId) {
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", parsed.data.projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (projectError) return failInternal("conversations", projectError);
    if (!project) return fail(404, "NOT_FOUND", "Project not found");
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      mode: parsed.data.mode,
      title: "New conversation",
      project_id: parsed.data.projectId ?? null,
    })
    .select()
    .single();

  if (error) return failInternal("conversations", error);
  return ok(data, 201);
}
