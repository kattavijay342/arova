import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

let warnedAboutMissingConfig = false;

/**
 * Refreshes the Supabase auth session cookie on every request.
 *
 * If Supabase isn't configured yet (.env.local missing/incomplete), this
 * deliberately does NOT throw — this middleware runs on every route,
 * including pages that don't touch Supabase yet, and a hard failure here
 * would 500 the entire app just to view the landing page. Instead it logs
 * one clear warning to the server console and lets the request through.
 * Routes that actually need Supabase (the app/api/** handlers) still get a
 * clear error of their own via lib/server/requireUser.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  let env: { url: string; anonKey: string };
  try {
    env = getSupabaseEnv();
  } catch (err) {
    if (!warnedAboutMissingConfig) {
      warnedAboutMissingConfig = true;
      console.warn(
        `[supabase] ${err instanceof Error ? err.message : err}\n` +
          "[supabase] Continuing without a session — pages that call Supabase will fail until this is fixed."
      );
    }
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Required so an expired session is refreshed before it's read downstream.
  await supabase.auth.getUser();

  return response;
}
