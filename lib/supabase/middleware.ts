import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

let warnedAboutMissingConfig = false;

// Supabase's own auth-js client sets no fetch-level timeout on this call
// (verified against the installed SDK) — if Supabase's Auth service is slow
// or unreachable, an unbounded `await` here would hang *every single page
// navigation* in the app, not just auth pages, since this middleware runs
// on (almost) every request. Racing it against a timeout keeps a Supabase
// outage from also taking down page loads that don't otherwise need
// Supabase to be responsive right this second — the session simply isn't
// refreshed for that one request, exactly like the existing
// "not configured" fallback below already does.
const GET_USER_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

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

  // Required so an expired session is refreshed before it's read downstream
  // — but bounded, so a slow/unreachable Supabase Auth service degrades to
  // "this request's session isn't refreshed" instead of "every page in the
  // app hangs." The request still proceeds either way; a real auth failure
  // downstream (e.g. an expired session) still surfaces normally there,
  // this only prevents *this* call from blocking the whole response.
  const result = await withTimeout(supabase.auth.getUser(), GET_USER_TIMEOUT_MS);
  if (result === "timeout") {
    console.warn("[supabase] auth.getUser() timed out in middleware after " + GET_USER_TIMEOUT_MS + "ms — proceeding without a session refresh for this request.");
  }

  return response;
}
