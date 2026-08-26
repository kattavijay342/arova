import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for use in Route Handlers / Server Components. Reads the
 * user's session from cookies, so calls made with this client are subject
 * to the same Row Level Security policies as the signed-in user.
 *
 * Throws a clear error (see lib/supabase/env.ts) if NEXT_PUBLIC_SUPABASE_URL
 * or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local — callers in
 * API routes should go through getSessionUser() (lib/server/requireUser.ts),
 * which turns that into a clean JSON error response.
 */
export function createClient() {
  const cookieStore = cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — middleware handles the
          // actual refresh, so a failed write here is safe to ignore.
        }
      },
    },
  });
}
