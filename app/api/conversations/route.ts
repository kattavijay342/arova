import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const createConversationSchema = z.object({
  mode: z.enum(["student", "career", "general"]),
  projectId: z.string().uuid().optional(),
});

export async function GET() {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`conversations:list:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("conversations")
    .select("*, messages(*, message_feedback(rating))")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: true, referencedTable: "messages" });

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
