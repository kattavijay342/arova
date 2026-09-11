import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getGeminiEnv } from "@/lib/server/aiEnv";

/**
 * Lightweight, unauthenticated readiness check for uptime monitors and the
 * deployment platform itself — deliberately does *not* make a live call to
 * Supabase or Gemini (that would cost quota/money on every poll and add
 * real latency to something meant to be cheap and fast); it only confirms
 * the required env vars are present, the same check every request already
 * depends on transitively. No rate limiting here on purpose: a health
 * check is meant to be hit frequently and reliably, and this does no I/O
 * of its own to be abused.
 */
export async function GET() {
  const checks = {
    supabase: isConfigured(getSupabaseEnv),
    gemini: isConfigured(getGeminiEnv),
  };

  const healthy = Object.values(checks).every(Boolean);
  return NextResponse.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503 });
}

function isConfigured(getEnv: () => unknown): boolean {
  try {
    getEnv();
    return true;
  } catch {
    return false;
  }
}
