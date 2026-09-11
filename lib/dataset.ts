import { MAX_EXTRACTED_CHARS } from "./document";

/**
 * A CSV "dataset" attachment is kept distinct from a Phase 2 document
 * attachment even though both end up as embedded plain text: attaching a
 * dataset is the explicit signal the server uses to enable Gemini's code
 * execution tool for this conversation (see lib/server/gemini.ts) — a
 * generic document never should. Shared between the client (file-picker
 * detection, attachment chip rendering) and the server (upload validation,
 * embedding the CSV text into a persisted message).
 */

export const ALLOWED_DATASET_MIME_TYPES = ["text/csv"] as const;
export type AllowedDatasetMimeType = (typeof ALLOWED_DATASET_MIME_TYPES)[number];

export const ALLOWED_DATASET_EXTENSIONS = [".csv"];

export const MAX_DATASET_BYTES = 10 * 1024 * 1024; // 10MB — same ceiling as a document upload.

export interface DatasetMeta {
  filename: string;
  mimeType: string;
  rowCount: number;
  truncated: boolean;
}

const DATASET_BLOCK_RE = /\[\[dataset: (.*?) \| (.*?) \| (\d+) rows(, truncated)?\]\]\n([\s\S]*?)\n\[\[\/dataset\]\]/;

function countRows(csvText: string): number {
  // A trailing newline shouldn't count as an extra (empty) row; a header
  // row is counted like any other — this is a rough, good-enough figure for
  // the attachment chip, not used for anything the AI's own analysis
  // depends on (it reads the actual CSV text, not this count).
  return csvText.replace(/\n+$/, "").split("\n").length;
}

/** Builds the block embedded into a message's persisted `content`, mirroring lib/document.ts's buildDocumentBlock. */
export function buildDatasetBlock(meta: { filename: string; mimeType: string }, csvText: string, truncated: boolean): string {
  const rowCount = countRows(csvText);
  const truncatedFlag = truncated ? ", truncated" : "";
  return `[[dataset: ${meta.filename} | ${meta.mimeType} | ${rowCount} rows${truncatedFlag}]]\n${csvText}\n[[/dataset]]`;
}

export interface ParsedDatasetMessage {
  /** The user's typed text with the dataset block removed — empty string if they attached a file with no caption. */
  caption: string;
  meta: DatasetMeta;
  csvText: string;
}

/** Reconstructs the file-chip metadata (and strips the block from the visible caption) from a persisted message's content. Returns null for a message that never had a dataset attached. */
export function parseDatasetMessage(content: string): ParsedDatasetMessage | null {
  const match = content.match(DATASET_BLOCK_RE);
  if (!match) return null;

  const [, filename, mimeType, rowCountStr, truncatedFlag, csvText] = match;
  return {
    caption: content.slice(0, match.index).trim(),
    meta: { filename, mimeType, rowCount: Number(rowCountStr), truncated: Boolean(truncatedFlag) },
    csvText,
  };
}

/** True if `content` (any message's, not just the current one) has a dataset attached — used to keep code execution enabled for follow-up questions about a dataset uploaded earlier in the conversation. */
export function hasDatasetBlock(content: string): boolean {
  return DATASET_BLOCK_RE.test(content);
}

const GENERATED_CHART_RE = /!\[([^\]]*)\]\(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+\)/g;

/**
 * Replaces a chart image the model generated via code execution (embedded
 * as an ordinary markdown image — see lib/server/gemini.ts's
 * streamCodeExecutionReply) with a short text placeholder. Used only when
 * building `history` for a later turn, for the same reason as
 * stripGeneratedImageForHistory: a chart can be tens to hundreds of KB of
 * base64, and replaying that as "text" context on every later turn wastes
 * enormous tokens for no benefit — the model doesn't need to re-see a past
 * chart's pixels to answer a follow-up question about the data.
 */
export function stripGeneratedChartsForHistory(content: string): string {
  return content.replace(GENERATED_CHART_RE, (_match, alt: string) => `[Generated a chart: "${alt || "chart"}"]`);
}

export { MAX_EXTRACTED_CHARS };
