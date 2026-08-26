import { fail, ok } from "@/lib/server/apiResponse";
import { getSessionUser } from "@/lib/server/requireUser";
import { checkRateLimit } from "@/lib/server/rateLimit";
import type { UsageStats } from "@/lib/types";

export async function GET() {
  const { supabase, user, configError } = await getSessionUser();
  if (configError) return fail(500, "CONFIG_ERROR", configError);
  if (!user) return fail(401, "UNAUTHORIZED", "Authentication required");

  const rl = checkRateLimit(`usage:get:${user.id}`, 30, 60_000);
  if (!rl.ok) return fail(429, "RATE_LIMITED", `Too many requests. Try again in ${rl.retryAfterSeconds}s.`);

  const { data, error } = await supabase
    .from("user_usage_stats")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return fail(500, "INTERNAL_ERROR", error.message);

  const stats: UsageStats = {
    conversationCount: data?.conversation_count ?? 0,
    messageCount: data?.message_count ?? 0,
    lastActiveAt: data?.last_active_at ?? null,
    memberSince: data?.member_since ?? new Date().toISOString(),
  };

  return ok(stats);
}
