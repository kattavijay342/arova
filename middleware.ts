import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excludes /api/** in addition to the usual static-asset paths: every API
  // route already authenticates itself via getSessionUser() (see
  // lib/server/requireUser.ts), which performs the exact same
  // supabase.auth.getUser() call — including the same token-refresh
  // behavior — through its own Route Handler-scoped client, which (unlike a
  // Server Component render) *can* persist a refreshed cookie on its own.
  // Running this middleware for API calls too was a second, redundant
  // Supabase Auth round-trip on every single chat/message/project request,
  // doubling auth-related latency for no additional protection.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
