import { z } from "zod";
import { fail, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const createConversationSchema = z.object({
  mode: z.enum(["student", "career", "general"]),
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

  if (error) return fail(500, "INTERNAL_ERROR", error.message);
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

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: user.id, mode: parsed.data.mode, title: "New conversation" })
    .select()
    .single();

  if (error) return fail(500, "INTERNAL_ERROR", error.message);
  return ok(data, 201);
}
