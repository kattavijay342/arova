/**
 * Validates the Gemini env vars before the SDK is used, so a missing API
 * key fails with one clear message instead of an opaque SDK/network error.
 * Mirrors lib/supabase/env.ts.
 */
export function getGeminiEnv() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing AI configuration: GEMINI_API_KEY.\n\n" +
        "Fix: get a key from Google AI Studio (https://aistudio.google.com/apikey), " +
        "then add GEMINI_API_KEY=... to .env.local (server-only — never prefix it " +
        "with NEXT_PUBLIC_). Restart `npm run dev` after saving."
    );
  }

  return {
    apiKey,
    model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  };
}

/**
 * The text/chat model (above) has no image-generation capability at all —
 * this is a distinct, separately-configurable model for
 * lib/server/imageGeneration.ts. Defaults to Gemini's native
 * image-output-capable model rather than a dedicated Imagen model, matching
 * this app's existing single-endpoint conversational style.
 */
export function getGeminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
}
