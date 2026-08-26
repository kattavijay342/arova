/**
 * Validates the Supabase env vars before any client is created, so a missing
 * .env.local fails with one clear message instead of Supabase's generic
 * "URL and Key are required" error (or a confusing downstream crash).
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `Missing Supabase configuration: ${missing.join(", ")}.\n\n` +
        "Fix: copy .env.local.example to .env.local, then fill in your Supabase " +
        "project's URL and anon (public) key from the Supabase dashboard " +
        "(Project Settings → API). Restart `npm run dev` after saving."
    );
  }

  return { url: url!, anonKey: anonKey! };
}
