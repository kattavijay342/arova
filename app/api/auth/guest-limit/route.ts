import { fail, ok } from "@/lib/server/apiResponse";
import { checkRateLimit } from "@/lib/server/rateLimit";

/**
 * Guest (anonymous) sign-in has no user id yet — it's the one place in the
 * app where client IP is the only signal available before auth exists, so
 * it's used here despite being spoofable via X-Forwarded-For (unlike the
 * routes in app/api/conversations|messages/**, which are keyed by user id
 * specifically to close that gap). The goal here isn't a hard cap, just
 * enough friction to slow down a script minting unlimited guest accounts —
 * a generous limit that a real person clicking "Continue as guest" a few
 * times will never hit.
 */
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: Request) {
  const rl = checkRateLimit(`guest-signup:${getClientIp(request)}`, 8, 15 * 60_000);
  if (!rl.ok) {
    return fail(
      429,
      "RATE_LIMITED",
      `Too many guest sign-ins from this network. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} minute(s), or create an account instead.`
    );
  }
  return ok({ allowed: true });
}
