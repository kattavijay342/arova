/**
 * Shared between the server (embedding a generated image into a persisted
 * assistant message) and the client (parsing it back out to render an
 * <img>, and stripping it out of what's replayed to Gemini as text
 * history). Mirrors lib/document.ts's marker approach, with one difference:
 * the metadata header is base64-encoded JSON rather than pipe-delimited
 * plain text, because an image prompt is arbitrary user text (unlike a
 * filename) and could otherwise contain characters that would break a
 * fixed-delimiter format.
 */

export interface GeneratedImageMeta {
  prompt: string;
  mimeType: string;
}

export interface ParsedGeneratedImage extends GeneratedImageMeta {
  data: string;
  /** Any text the model returned alongside the image (see the /images route) — empty if it returned only the image. */
  caption: string;
}

function utf8ToBase64(str: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(str, "utf-8").toString("base64");
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf-8");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

const GENERATED_IMAGE_RE = /\[\[generated-image:([A-Za-z0-9+/=]+)\]\]\n([\s\S]*?)\n\[\[\/generated-image\]\]/;

/** Embeds a generated image into a message's persisted `content`. */
export function buildGeneratedImageBlock(meta: GeneratedImageMeta, base64ImageData: string): string {
  const encodedMeta = utf8ToBase64(JSON.stringify(meta));
  return `[[generated-image:${encodedMeta}]]\n${base64ImageData}\n[[/generated-image]]`;
}

/** Reconstructs the prompt/mimeType/image bytes from a persisted message's content, or null if it never had a generated image. */
export function parseGeneratedImageMessage(content: string): ParsedGeneratedImage | null {
  const match = content.match(GENERATED_IMAGE_RE);
  if (!match || match.index === undefined) return null;
  try {
    const meta = JSON.parse(base64ToUtf8(match[1])) as GeneratedImageMeta;
    // The block is always appended after any caption the model returned
    // (see the /images route) — everything before its start is that text.
    const caption = content.slice(0, match.index).trim();
    return { prompt: meta.prompt, mimeType: meta.mimeType, data: match[2], caption };
  } catch {
    return null;
  }
}

/**
 * Replaces a generated-image block with a short text placeholder. Used only
 * when building the `history` array sent to Gemini for ordinary *text*
 * turns (see app/api/conversations/[id]/messages/route.ts) — without this,
 * a multi-hundred-KB base64 image would get replayed as "text" on every
 * later message in the conversation, wasting enormous context/cost and
 * confusing the model.
 */
export function stripGeneratedImageForHistory(content: string): string {
  return content.replace(GENERATED_IMAGE_RE, (_match, metaB64: string) => {
    try {
      const meta = JSON.parse(base64ToUtf8(metaB64)) as GeneratedImageMeta;
      return `[Generated an image: "${meta.prompt}"]`;
    } catch {
      return "[Generated an image]";
    }
  });
}
