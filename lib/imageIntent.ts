/**
 * Detects a plain-text image-generation request typed into the normal
 * composer (no manual "image generation mode" toggle) — e.g. "Generate an
 * image of a futuristic city at night". Without this, a message phrased
 * exactly like that was sent through the ordinary text-chat path and the
 * text model just replied in words instead of an image ever being
 * generated (TC28).
 *
 * Deliberately a cheap, deterministic heuristic rather than an LLM call —
 * no extra request, no added cost/latency, and no new failure mode. It
 * requires the message to *start* with an imperative creation verb (how
 * people actually phrase these requests) AND separately mention a visual
 * noun, so ordinary requests like "Create a study plan" or "Generate a
 * summary" are left alone. It can't have perfect precision (e.g. "Create a
 * picture-perfect resume" would false-positive) — that tradeoff is
 * accepted in exchange for staying free and instant.
 */
const IMAGE_INTENT_PATTERN =
  /^(?:please\s+|can you\s+|could you\s+)*(?:generate|create|draw|design|paint|render|imagine|sketch|make)\b[\s\S]*?\b(images?|pictures?|photos?|photographs?|illustrations?|artworks?|drawings?|paintings?|sketch(?:es)?|cartoons?|landscapes?|portraits?|wallpapers?|posters?|logos?|icons?|scenes?|cityscapes?|avatars?|mascots?|graphics?)\b/i;

export function looksLikeImageGenerationRequest(text: string): boolean {
  return IMAGE_INTENT_PATTERN.test(text.trim());
}
