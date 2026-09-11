import { jsPDF } from "jspdf";
import {
  PAGE,
  MARGIN,
  CONTENT_WIDTH,
  COLOR,
  FONT_SIZE,
  PdfWriter,
  renderMarkdownTree,
  drawFootersAndPageNumbers,
  slugifyForFilename,
  sanitizeForPdf,
} from "./pdfEngine";

/**
 * Renders one AI chat response (Markdown) into a paginated, branded PDF and
 * triggers a browser download. Shared by Student Mode, General Mode, and
 * Career Mode's general Q&A/roadmap/resume replies — only the "AROVA AI /
 * <mode label>" header text and filename differ per caller. Client-side
 * only — the chat message itself is never touched; this only ever reads its
 * content.
 */

function drawFirstPageHeader(writer: PdfWriter, question: string) {
  const { doc } = writer;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLOR.brand);
  doc.text("AROVA AI", MARGIN.left, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.muted);
  doc.text(writer.headerLabel, MARGIN.left, 64);

  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(1);
  doc.line(MARGIN.left, 74, PAGE.width - MARGIN.right, 74);

  writer.cursorY = 74 + 22;

  if (question.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SIZE.small);
    doc.setTextColor(...COLOR.faint);
    doc.text("QUESTION", MARGIN.left, writer.cursorY);
    writer.cursorY += 14;

    writer.writeRuns([{ text: sanitizeForPdf(question.trim()), bold: true }], {
      x: MARGIN.left,
      maxWidth: CONTENT_WIDTH,
      lineHeight: 17,
      baseSize: 13,
      color: COLOR.text,
    });
    writer.addSpacing(6);
    writer.writeRule();
  } else {
    writer.addSpacing(4);
  }
}

function buildChatResponsePdf(modeLabel: string, question: string, answer: string): jsPDF {
  const writer = new PdfWriter(modeLabel);
  drawFirstPageHeader(writer, question);
  renderMarkdownTree(writer, answer);
  drawFootersAndPageNumbers(writer.doc, new Date());
  return writer.doc;
}

/**
 * Builds and downloads a branded PDF for one AI chat response. Shared by
 * Student Mode, General Mode, and Career Mode — `modeLabel` controls the
 * "AROVA AI / <modeLabel>" header and running header/footer text, and feeds
 * the downloaded filename. Never mutates chat state — purely reads
 * `question`/`answer` and produces a client-side file. Throws on empty
 * content or a jsPDF failure so the caller can show
 * "Unable to generate PDF. Please try again."
 */
export async function exportChatResponseAsPdf({
  modeLabel,
  question,
  answer,
}: {
  modeLabel: string;
  question: string;
  answer: string;
}): Promise<void> {
  if (!answer || !answer.trim()) {
    throw new Error("There's no response content to export yet.");
  }

  // Yields one frame so the caller's "Generating PDF..." state paints before
  // the synchronous layout work below runs on the main thread.
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  const doc = buildChatResponsePdf(modeLabel, question, answer);
  const modeSlug = slugifyForFilename(modeLabel, "chat");
  const topicSlug = slugifyForFilename(question, "response");
  doc.save(`Arova-${modeSlug}-${topicSlug}.pdf`);
}
