import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * For an unexpected server-side failure (a failed DB query, an unhandled
 * exception) — logs the real error server-side (where a raw Postgres/
 * Supabase message is safe and useful for debugging) and returns a generic
 * message to the client, which never sees internal details like table/column
 * names or constraint names. Use this instead of `fail(500, "INTERNAL_ERROR",
 * error.message)` for anything that isn't already a clean, hand-written,
 * user-safe string (a `CONFIG_ERROR` from lib/server/*Env.ts, for instance,
 * is deliberately verbose for the developer setting up their own instance
 * and should keep using `fail` directly).
 */
export function failInternal(label: string, error: unknown, message = "Something went wrong. Please try again.") {
  console.error(`[${label}]`, error instanceof Error ? error.message : error);
  return fail(500, "INTERNAL_ERROR", message);
}
