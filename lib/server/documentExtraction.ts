import { extractRawText } from "mammoth";
import { MAX_EXTRACTED_CHARS } from "@/lib/document";

export class DocumentExtractionError extends Error {}

/**
 * Text extraction for PDF uses `pdfjs-dist` (the actively-maintained Mozilla
 * PDF.js library — the same engine Firefox/Chrome use) imported directly,
 * rather than the popular `pdf-parse` wrapper: `pdf-parse` pins a frozen
 * pdf.js build from ~2016 internally, which rejected a perfectly valid,
 * standards-compliant PDF in testing ("bad XRef entry") that this current
 * version reads correctly. Importing pdfjs-dist's own "legacy" Node build
 * directly avoids depending on an abandoned wrapper for no benefit.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    verbosity: 0, // pdf.js logs routine warnings (e.g. missing embedded font metrics) that are irrelevant to plain text extraction.
  });

  try {
    const pdf = await loadingTask.promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n";
      page.cleanup();
      // Extracting page-by-page and stopping once there's more than enough
      // text avoids wasting time parsing the rest of a very long PDF whose
      // tail would just be discarded by the MAX_EXTRACTED_CHARS cap anyway.
      if (text.length > MAX_EXTRACTED_CHARS) break;
    }
    return text;
  } finally {
    await loadingTask.destroy();
  }
}

/**
 * Extracts plain text from an uploaded PDF/DOCX/TXT/MD file, server-side
 * only. Never throws a raw parser error to the caller — a corrupted,
 * password-protected, or otherwise unreadable file becomes a clean
 * `DocumentExtractionError` with a message that's safe to show the user
 * directly (see the messages route, which does exactly that).
 */
export async function extractDocumentText(
  mimeType: string,
  buffer: Buffer
): Promise<{ text: string; truncated: boolean }> {
  let raw: string;

  try {
    switch (mimeType) {
      case "application/pdf":
        raw = await extractPdfText(buffer);
        break;
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
        const result = await extractRawText({ buffer });
        raw = result.value;
        break;
      }
      case "text/plain":
      case "text/markdown":
        raw = buffer.toString("utf-8");
        break;
      default:
        throw new DocumentExtractionError(`Unsupported file type: ${mimeType}`);
    }
  } catch (err) {
    if (err instanceof DocumentExtractionError) throw err;
    console.error("[document] extraction failed:", err);
    throw new DocumentExtractionError(
      "Could not read this file — it may be corrupted, password-protected, or in an unsupported format."
    );
  }

  raw = raw.trim();
  if (!raw) {
    throw new DocumentExtractionError(
      "No readable text was found in this file (it may be a scanned image with no text layer)."
    );
  }

  const truncated = raw.length > MAX_EXTRACTED_CHARS;
  const text = truncated ? raw.slice(0, MAX_EXTRACTED_CHARS) : raw;
  return { text, truncated };
}
