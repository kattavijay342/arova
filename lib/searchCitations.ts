/**
 * Shared between the server (embedding the sources Gemini's Google Search
 * grounding cited into a persisted assistant message) and the client
 * (parsing them back out to render a "Sources" row, and stripping them out
 * of what's replayed to Gemini as text history). Mirrors
 * lib/generatedImage.ts's marker approach — a single trailing block with
 * base64-encoded JSON metadata, since a page title is arbitrary text that
 * could otherwise contain characters that would break a fixed-delimiter
 * format.
 */

export interface WebSource {
  title: string;
  uri: string;
}

/** The block's actual on-disk shape (see buildSearchCitationsBlock/parseSearchCitationsMessage below). */
interface CitationsPayload {
  sources: WebSource[];
  /** True for a Deep Research reply (a more thorough, multi-angle investigation — see DEEP_RESEARCH_INSTRUCTION in lib/server/gemini.ts) rather than a plain grounded search. Lets the UI give it a distinct "Research Report" treatment and export label. */
  deepResearch?: boolean;
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

const CITATIONS_RE = /\n\n\[\[search-citations:([A-Za-z0-9+/=]+)\]\]$/;

/** Appends the sources Gemini's Google Search grounding cited to an assistant reply's persisted `content`. */
export function buildSearchCitationsBlock(sources: WebSource[], deepResearch?: boolean): string {
  const payload: CitationsPayload = deepResearch ? { sources, deepResearch: true } : { sources };
  const encoded = utf8ToBase64(JSON.stringify(payload));
  return `\n\n[[search-citations:${encoded}]]`;
}

export interface ParsedSearchCitations {
  sources: WebSource[];
  deepResearch: boolean;
  /** The assistant's reply text with the citations block removed. */
  content: string;
}

/**
 * Reconstructs the cited sources (and the clean reply text) from a
 * persisted message's content, or null if it was never grounded. A message
 * from before Deep Research's own "Research Report" treatment existed has a
 * bare `WebSource[]` array as its payload rather than the current
 * `{ sources, deepResearch? }` object — both are read correctly here, the
 * older shape just always reads as `deepResearch: false`.
 */
export function parseSearchCitationsMessage(content: string): ParsedSearchCitations | null {
  const match = content.match(CITATIONS_RE);
  if (!match || match.index === undefined) return null;
  try {
    const parsed = JSON.parse(base64ToUtf8(match[1])) as WebSource[] | CitationsPayload;
    const sources = Array.isArray(parsed) ? parsed : parsed.sources;
    const deepResearch = !Array.isArray(parsed) && Boolean(parsed.deepResearch);
    return { sources, deepResearch, content: content.slice(0, match.index).trimEnd() };
  } catch {
    return null;
  }
}

/**
 * Drops a citations block entirely when building `history` for a later
 * turn — the sources only support the reply text that's already being
 * replayed; re-sending the raw list adds nothing for the model to reason
 * about and just spends tokens.
 */
export function stripSearchCitationsForHistory(content: string): string {
  return content.replace(CITATIONS_RE, "");
}
