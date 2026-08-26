import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Only allow redirecting to a same-site path after the exchange. `next`
 * comes from a query param on a link the user clicks, so a value like
 * "@evil.com" must not be trusted as-is: naively building the redirect as
 * `${origin}${next}` would let that value be parsed as
 * "https://oursite.com@evil.com" — a URL whose actual host is evil.com —
 * sending the user off-site right after a legitimate, successful sign-in.
 */
function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("@")) {
    return "/dashboard";
  }
  return next;
}

/**
 * Handles the redirect after a user clicks an email confirmation link
 * (signup confirmation, or an email-change confirmation from Settings).
 *
 * Root cause this fixes: signUp() previously didn't set `emailRedirectTo`,
 * so Supabase sent users back to the site root (`/`) with a PKCE `?code=`
 * in the URL, relying entirely on the browser Supabase client's *implicit*
 * detectSessionInUrl auto-exchange. That only works if the link is opened
 * in the exact same browser/profile that started the signup (PKCE's
 * code_verifier lives in that browser's storage) — open it anywhere else
 * (a different browser, the email app's in-app browser, a device that
 * isn't the one you signed up on) and the exchange fails *silently*: no
 * error, just the normal landing page, looking like nothing happened. The
 * account stays unconfirmed, and the next password login fails with
 * Supabase's generic "Invalid login credentials" — the same message it
 * returns for a wrong password — which is what made this look like a
 * credentials bug rather than an incomplete confirmation.
 *
 * This route makes the exchange explicit and server-side instead, and
 * gives the user a clear, visible error if it fails rather than a silent
 * no-op.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "That confirmation link didn't work — it may have expired, already been used, or been opened in a different browser than the one you signed up in. Please sign up again or request a new link."
      )}`
    );
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Missing confirmation code. Please use the link from your email again.")}`
  );
}
