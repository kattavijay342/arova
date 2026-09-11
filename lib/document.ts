import type { DocumentAttachmentMeta } from "./types";

/**
 * Shared between the client (file-picker validation, attachment chip
 * rendering) and the server (upload validation, embedding extracted text
 * into a persisted message) so both sides agree on exactly the same
 * allow-list and size limits.
 */

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

/** File-extension allow-list for the client's <input accept> and a friendly rejection message. Legacy binary .doc has no reliable pure-JS parser, so it's explicitly unsupported. */
export const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB — generous for a report/resume, bounded for a serverless function's time/memory budget.

// Extracted text is capped independently of file size (a large PDF can
// extract to far more or far less text than its byte size suggests) so a
// single document can't blow up the conversation's token usage/cost on
// every later turn that replays it as history.
export const MAX_EXTRACTED_CHARS = 50_000;

function mimeLabel(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    case "text/markdown":
      return "Markdown";
    case "text/plain":
      return "Text";
    default:
      return "Document";
  }
}

export function documentTypeLabel(mimeType: string): string {
  return mimeLabel(mimeType);
}

const DOC_BLOCK_RE = /\[\[document: (.*?) \| (.*?) \| (\d+) chars(, truncated)?\]\]\n([\s\S]*?)\n\[\[\/document\]\]/;

/**
 * Builds the block embedded into a message's persisted `content` so the
 * document's extracted text is replayed as part of history on every later
 * turn (this is what makes document Q&A "conversation-aware" — see the
 * Phase 2 audit). Kept human-readable on purpose: it's plain text Gemini
 * reads like any other part of the message, not a hidden encoding.
 */
export function buildDocumentBlock(meta: DocumentAttachmentMeta, extractedText: string): string {
  const truncatedFlag = meta.truncated ? ", truncated" : "";
  return `[[document: ${meta.filename} | ${meta.mimeType} | ${meta.charCount} chars${truncatedFlag}]]\n${extractedText}\n[[/document]]`;
}

export interface ParsedDocumentMessage {
  /** The user's typed text with the document block removed — empty string if they attached a file with no caption. */
  caption: string;
  meta: DocumentAttachmentMeta;
  extractedText: string;
}

/** Reconstructs the file-chip metadata (and strips the block from the visible caption) from a persisted message's content. Returns null for a message that never had a document attached. */
export function parseDocumentMessage(content: string): ParsedDocumentMessage | null {
  const match = content.match(DOC_BLOCK_RE);
  if (!match) return null;

  const [, filename, mimeType, charCountStr, truncatedFlag, extractedText] = match;
  return {
    // The block is always appended after the caption (see buildDocumentBlock's
    // caller) — everything before its start is the user's typed text, if any.
    caption: content.slice(0, match.index).trim(),
    meta: {
      filename,
      mimeType,
      charCount: Number(charCountStr),
      truncated: Boolean(truncatedFlag),
    },
    extractedText,
  };
}
