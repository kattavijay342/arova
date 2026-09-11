import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const MAX_MEMORY_CHARS = 500;
const MAX_MEMORIES_PER_USER = 100;

const createMemorySchema = z.object({
  content: z.string().trim().min(1, "Enter something to remember").max(MAX_MEMORY_CHARS, "Keep it under 500 characters"),
});

export async function GET() {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`memories:list:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("user_memories")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return failInternal("memories", error);
  return ok(data);
}

/**
 * Saves one user-provided fact. There is no automatic extraction anywhere in
 * this app — a memory only ever exists because the user explicitly typed it
 * (Settings) or clicked "Remember this" on a message they wrote themselves.
 */
export async function POST(request: Request) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`memories:create:${user.id}`, 20, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = createMemorySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  // A generous but real ceiling — keeps a runaway client (or a user who
  // never prunes) from growing the context injected into every single
  // message without bound.
  const { count, error: countError } = await supabase
    .from("user_memories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (countError) return failInternal("memories", countError);
  if ((count ?? 0) >= MAX_MEMORIES_PER_USER) {
    return fail(400, "BAD_REQUEST", `You've reached the limit of ${MAX_MEMORIES_PER_USER} memories. Delete one first.`);
  }

  const { data, error } = await supabase
    .from("user_memories")
    .insert({ user_id: user.id, content: parsed.data.content })
    .select()
    .single();

  if (error) return failInternal("memories", error);
  return ok(data, 201);
}
