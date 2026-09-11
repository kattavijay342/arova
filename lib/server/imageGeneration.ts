import { GoogleGenAI, FinishReason, Modality } from "@google/genai";
import { getGeminiEnv, getGeminiImageModel } from "./aiEnv";

/**
 * Image generation uses `@google/genai` — a second, newer Google SDK
 * installed alongside the existing `@google/generative-ai` that powers
 * lib/server/gemini.ts. That older SDK has no image-generation capability
 * at all (verified before adding this), and migrating the whole,
 * already-working chat/vision/streaming pipeline to a new SDK just for this
 * one feature would be a much larger, riskier change than adding a second,
 * narrowly-scoped dependency. Nothing in lib/server/gemini.ts is touched.
 *
 * Gemini's own image-output models have no free-tier quota on this
 * project's API key (verified live: 429 with `limit: 0`, not merely
 * "exhausted") — a Google account/billing restriction, not a bug. Rather
 * than silently switch to a paid provider, Gemini stays the primary path
 * (it's the higher-quality, better-moderated option whenever billing is
 * enabled) and Pollinations.ai — a free, keyless, no-signup image API — is
 * used only as a fallback when Gemini itself fails for a non-safety reason.
 */

export class ImageGenerationError extends Error {
  /** Set when Gemini itself refused the prompt on content-safety grounds — this is never retried against the fallback provider, since a safety refusal is a judgment call about the prompt, not an availability problem. */
  safetyBlocked: boolean;

  constructor(message: string, safetyBlocked = false) {
    super(message);
    this.name = "ImageGenerationError";
    this.safetyBlocked = safetyBlocked;
  }
}

export interface GeneratedImageResult {
  mimeType: string;
  data: string; // base64
  /** Optional short caption/commentary the model returned alongside the image. */
  text?: string;
}

const SAFETY_FINISH_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.IMAGE_SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
]);

async function generateImageWithGemini(prompt: string): Promise<GeneratedImageResult> {
  const { apiKey } = getGeminiEnv();
  const model = getGeminiImageModel();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];

  if (candidate?.finishReason && SAFETY_FINISH_REASONS.has(candidate.finishReason)) {
    throw new ImageGenerationError(
      "That prompt couldn't be generated because it may violate content safety guidelines. Please try a different description.",
      true
    );
  }

  const parts = candidate?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);
  const textPart = parts.find((p) => p.text)?.text;

  if (!imagePart?.inlineData?.data) {
    throw new ImageGenerationError("The assistant didn't return an image for that prompt. Please try rephrasing it.");
  }

  return {
    mimeType: imagePart.inlineData.mimeType || "image/png",
    data: imagePart.inlineData.data,
    text: textPart,
  };
}

const POLLINATIONS_TIMEOUT_MS = 30_000;

/**
 * Free, keyless fallback (https://pollinations.ai) — a GET request against a
 * public Stable-Diffusion-backed endpoint that returns raw image bytes, no
 * account or API key required. It's an unofficial third-party service with
 * no SLA and weaker content moderation than Gemini's, which is exactly why
 * it's only reached as a fallback, never the first attempt.
 */
async function generateImageWithPollinations(prompt: string): Promise<GeneratedImageResult> {
  // A random seed per request — Pollinations otherwise caches/returns the
  // same image for an identical prompt, which would make "regenerate" a
  // no-op.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POLLINATIONS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    console.error("[image-generation] Pollinations request failed:", err);
    throw new ImageGenerationError("Image generation is temporarily unavailable. Please try again in a moment.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.error("[image-generation] Pollinations returned", response.status);
    throw new ImageGenerationError("Image generation is temporarily unavailable. Please try again in a moment.");
  }

  // Pollinations sometimes answers a request it can't fulfill with a 200
  // and an HTML/text error page rather than a real image — checking the
  // content type catches that instead of persisting garbage as image bytes.
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!contentType.startsWith("image/")) {
    throw new ImageGenerationError("The assistant didn't return an image for that prompt. Please try rephrasing it.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    mimeType: contentType || "image/jpeg",
    data: buffer.toString("base64"),
  };
}

/**
 * Generates one image from a text prompt (one-shot — no conversation
 * history is threaded into this call; each generation is independent of
 * prior turns, matching "prompt-based image creation" rather than
 * conversational image editing). Tries Gemini first; on any failure other
 * than an explicit safety refusal, falls back to Pollinations so a $0 path
 * to a real generated image still exists even when Gemini's own
 * image-output models are unavailable (missing key, network error, or —
 * the case on this project's current API key — a free tier with zero quota
 * for image models).
 */
export async function generateImage(prompt: string): Promise<GeneratedImageResult> {
  try {
    return await generateImageWithGemini(prompt);
  } catch (err) {
    if (err instanceof ImageGenerationError && err.safetyBlocked) {
      throw err;
    }
    console.error(
      "[image-generation] Gemini failed, falling back to Pollinations:",
      err instanceof Error ? err.message : err
    );
  }

  try {
    return await generateImageWithPollinations(prompt);
  } catch (err) {
    console.error("[image-generation] Pollinations fallback also failed:", err instanceof Error ? err.message : err);
    throw err instanceof ImageGenerationError
      ? err
      : new ImageGenerationError("Image generation is temporarily unavailable. Please try again in a moment.");
  }
}
