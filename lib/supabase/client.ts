import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for use in Client Components (browser).
 * Throws a clear error (see lib/supabase/env.ts) if NEXT_PUBLIC_SUPABASE_URL
 * or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing from .env.local.
 */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
