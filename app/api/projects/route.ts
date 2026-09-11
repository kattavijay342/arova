import { z } from "zod";
import { fail, failInternal, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name cannot be empty").max(100, "Name is too long"),
});

export async function GET() {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`projects:list:${user.id}`, 60, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return failInternal("projects", error);
  return ok(data);
}

export async function POST(request: Request) {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`projects:create:${user.id}`, 20, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const parsed = createProjectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail(400, "BAD_REQUEST", "Validation failed", parsed.error.issues);
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name: parsed.data.name })
    .select()
    .single();

  if (error) return failInternal("projects", error);
  return ok(data, 201);
}
