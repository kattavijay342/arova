import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type SessionResult =
  | { configError: string; supabase: null; user: null }
  | { configError: null; supabase: ReturnType<typeof createClient>; user: User | null };

/**
 * Reads the signed-in user from the request's Supabase session cookie.
 *
 * If Supabase isn't configured (.env.local missing/incomplete), this
 * returns `configError` instead of throwing, so every API route can turn it
 * into a clear JSON error response rather than an unhandled 500.
 */
export async function getSessionUser(): Promise<SessionResult> {
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient();
  } catch (err) {
    return {
      configError: err instanceof Error ? err.message : "Supabase is not configured.",
      supabase: null,
      user: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { configError: null, supabase, user };
}
