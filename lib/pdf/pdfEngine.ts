import { jsPDF } from "jspdf";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, RootContent, PhrasingContent, List } from "mdast";

/**
 * Shared low-level PDF rendering toolkit: layout constants, Markdown→PDF
 * block rendering, pagination, and the running header/footer. Used by both
 * `exportChatResponsePdf.ts` (a single AI response as one markdown blob —
 * Student/General/Career-general Mode) and `exportInterviewReportPdf.ts` (a
 * structured, multi-section Career Mode interview report). Keeping this in
 * one place means every export shares identical typography, spacing, and
 * pagination behavior instead of drifting across copies.
 */

// ── Layout constants (A4, in points — 1pt = 1/72in) ────────────────────────

export const PAGE = { width: 595.28, height: 841.89 };
export const MARGIN = { top: 96, bottom: 54, left: 50, right: 50 };
export const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
export const CONTINUATION_HEADER_HEIGHT = 34;
export const LIST_INDENT_STEP = 16;
export const MAX_LIST_DEPTH = 4;

export const COLOR = {
  brand: [61, 79, 168] as [number, number, number],
  text: [26, 34, 48] as [number, number, number],
  muted: [92, 102, 116] as [number, number, number],
  faint: [136, 146, 160] as [number, number, number],
  rule: [223, 228, 234] as [number, number, number],
  codeBg: [244, 245, 248] as [number, number, number],
  codeText: [40, 44, 52] as [number, number, number],
  quoteBg: [237, 240, 251] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  career: [166, 105, 10] as [number, number, number],
  careerSoft: [251, 240, 221] as [number, number, number],
  good: [26, 138, 110] as [number, number, number],
  goodSoft: [229, 245, 240] as [number, number, number],
};

export const FONT_SIZE = { h1: 17, h2: 14.5, h3: 12.5, h4: 11.5, body: 11, small: 8.5, code: 9.5 };
export const LINE_HEIGHT = { h1: 23, h2: 20, h3: 18, h4: 16, body: 15.5, code: 13, small: 11.5 };
export const SPACE_AFTER_BLOCK = 8;
export const SPACE_AFTER_HEADING = 6;

// ── Special character handling ─────────────────────────────────────────────

// jsPDF's built-in fonts only cover the WinAnsi/Latin-1 range. AI responses
// routinely use typographic Unicode punctuation that falls outside it and
// would otherwise render as blank boxes — normalize those to safe ASCII
// equivalents instead of letting the PDF corrupt those characters.
const CHAR_MAP: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": ",",
  "‛": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "--",
  "…": "...",
  "•": "-",
  " ": " ",
  "‹": "<",
  "›": ">",
  "«": '"',
  "»": '"',
};
const UNSAFE_CHAR_RE = new RegExp(`[${Object.keys(CHAR_MAP).join("")}]`, "g");

export function sanitizeForPdf(input: string): string {
  return input.replace(UNSAFE_CHAR_RE, (ch) => CHAR_MAP[ch] ?? ch).replace(/​/g, "");
}

// ── Inline run extraction (bold / italic / inline code / links) ───────────

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
  isBreak?: boolean;
}

export function extractRuns(
  nodes: PhrasingContent[] | undefined,
  style: { bold?: boolean; italic?: boolean; code?: boolean; href?: string } = {}
): Run[] {
  if (!nodes) return [];
  const runs: Run[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        runs.push({ text: sanitizeForPdf(node.value), ...style });
        break;
      case "inlineCode":
        runs.push({ text: sanitizeForPdf(node.value), ...style, code: true });
        break;
      case "strong":
        runs.push(...extractRuns(node.children, { ...style, bold: true }));
        break;
      case "emphasis":
        runs.push(...extractRuns(node.children, { ...style, italic: true }));
        break;
      case "delete":
        runs.push(...extractRuns(node.children, style));
        break;
      case "link":
        runs.push(...extractRuns(node.children, { ...style, href: node.url }));
        break;
      case "break":
        runs.push({ text: "\n", isBreak: true });
        break;
      case "image":
        if (node.alt) runs.push({ text: `[${sanitizeForPdf(node.alt)}]`, ...style, italic: true });
        break;
      default:
        break;
    }
  }
  return runs;
}

/** Best-effort plain-text fallback for any node type this renderer doesn't special-case. */
export function nodeToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { value?: unknown; children?: unknown[] };
  if (typeof n.value === "string") return n.value;
  if (Array.isArray(n.children)) return n.children.map(nodeToPlainText).join("");
  return "";
}

// ── PDF writer: owns the cursor, page breaks, and running header/footer ───

export class PdfWriter {
  doc: jsPDF;
  cursorY = MARGIN.top;
  /** Shown in the small running header drawn at the top of every page after the first. */
  headerLabel: string;

  constructor(headerLabel: string) {
    this.doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    this.headerLabel = headerLabel;
  }

  /** Breaks to a new page (with running header) if `height` won't fit before the footer margin. */
  ensureSpace(height: number) {
    if (this.cursorY + height > PAGE.height - MARGIN.bottom) {
      this.doc.addPage();
      this.cursorY = MARGIN.top - CONTINUATION_HEADER_HEIGHT;
      this.drawContinuationHeader();
    }
  }

  drawContinuationHeader() {
    const { doc } = this;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SIZE.small);
    doc.setTextColor(...COLOR.muted);
    doc.text(`AROVA AI  ·  ${this.headerLabel}`, MARGIN.left, this.cursorY + 12);
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(0.75);
    doc.line(MARGIN.left, this.cursorY + 20, PAGE.width - MARGIN.right, this.cursorY + 20);
    this.cursorY += CONTINUATION_HEADER_HEIGHT;
  }

  addSpacing(amount: number) {
    this.cursorY += amount;
  }

  setRunFont(run: Run, baseSize: number) {
    if (run.code) {
      this.doc.setFont("courier", run.bold ? "bold" : "normal");
      this.doc.setFontSize(baseSize - 0.5);
    } else {
      const style = run.bold && run.italic ? "bolditalic" : run.bold ? "bold" : run.italic ? "italic" : "normal";
      this.doc.setFont("helvetica", style);
      this.doc.setFontSize(baseSize);
    }
  }

  /** Word-wraps mixed-style runs (bold/italic/code/links) into lines, honoring a hanging indent. */
  writeRuns(
    runs: Run[],
    opts: { x: number; wrapX?: number; maxWidth: number; lineHeight: number; baseSize: number; color?: [number, number, number] }
  ) {
    const wrapX = opts.wrapX ?? opts.x;
    const color = opts.color ?? COLOR.text;
    type Token = { word: string; run: Run };
    const tokens: Token[] = [];
    for (const run of runs) {
      if (run.isBreak) {
        tokens.push({ word: "\n", run });
        continue;
      }
      const parts = run.text.split(/(\s+)/).filter((w) => w.length > 0);
      for (const w of parts) tokens.push({ word: w, run });
    }

    let line: Token[] = [];
    let lineWidth = 0;
    let isFirstLine = true;

    const flushLine = () => {
      if (line.length === 0) return;
      this.ensureSpace(opts.lineHeight);
      let x = isFirstLine ? opts.x : wrapX;
      for (const tok of line) {
        this.setRunFont(tok.run, opts.baseSize);
        this.doc.setTextColor(...(tok.run.href ? COLOR.brand : color));
        if (tok.run.href) {
          this.doc.textWithLink(tok.word, x, this.cursorY, { url: tok.run.href });
        } else {
          this.doc.text(tok.word, x, this.cursorY);
        }
        x += this.doc.getTextWidth(tok.word);
      }
      this.cursorY += opts.lineHeight;
      line = [];
      lineWidth = 0;
      isFirstLine = false;
    };

    const lineMaxWidth = () => opts.maxWidth - ((isFirstLine ? opts.x : wrapX) - wrapX);

    for (const tok of tokens) {
      if (tok.word === "\n" && tok.run.isBreak) {
        flushLine();
        continue;
      }
      this.setRunFont(tok.run, opts.baseSize);
      const w = this.doc.getTextWidth(tok.word);
      if (line.length === 0 && tok.word.trim() === "") continue;
      if (lineWidth + w > lineMaxWidth() && line.length > 0) flushLine();
      line.push(tok);
      lineWidth += w;
    }
    flushLine();
  }

  writeHeading(depth: number, runs: Run[], indent = 0) {
    const key = depth <= 1 ? "h1" : depth === 2 ? "h2" : depth === 3 ? "h3" : "h4";
    this.addSpacing(depth <= 2 ? 10 : 6);
    this.writeRuns(
      runs.map((r) => ({ ...r, bold: true })),
      { x: MARGIN.left + indent, maxWidth: CONTENT_WIDTH - indent, lineHeight: LINE_HEIGHT[key], baseSize: FONT_SIZE[key], color: COLOR.brand }
    );
    this.addSpacing(SPACE_AFTER_HEADING);
  }

  writeParagraph(runs: Run[], indent = 0) {
    if (runs.length === 0) return;
    this.writeRuns(runs, {
      x: MARGIN.left + indent,
      maxWidth: CONTENT_WIDTH - indent,
      lineHeight: LINE_HEIGHT.body,
      baseSize: FONT_SIZE.body,
    });
    this.addSpacing(SPACE_AFTER_BLOCK);
  }

  writeListItemLine(marker: string, runs: Run[], indent: number) {
    const markerWidth = 18;
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(FONT_SIZE.body);
    if (marker) {
      this.ensureSpace(LINE_HEIGHT.body);
      this.doc.setTextColor(...COLOR.text);
      this.doc.text(marker, MARGIN.left + indent, this.cursorY);
    }
    this.writeRuns(runs, {
      x: MARGIN.left + indent + markerWidth,
      maxWidth: CONTENT_WIDTH - indent - markerWidth,
      lineHeight: LINE_HEIGHT.body,
      baseSize: FONT_SIZE.body,
    });
  }

  writeList(list: List, depth = 0) {
    const indent = Math.min(depth, MAX_LIST_DEPTH) * LIST_INDENT_STEP;
    let index = list.start ?? 1;
    for (const item of list.children) {
      let markerUsed = false;
      for (const child of item.children) {
        if (child.type === "paragraph") {
          const marker = markerUsed ? "" : list.ordered ? `${index}.` : "-";
          this.writeListItemLine(marker, extractRuns(child.children), indent);
          markerUsed = true;
        } else if (child.type === "list") {
          this.writeList(child, depth + 1);
        } else if (child.type === "code") {
          this.writeCodeBlock(child.value, indent + LIST_INDENT_STEP);
        } else {
          const text = nodeToPlainText(child).trim();
          if (text) this.writeListItemLine(markerUsed ? "" : list.ordered ? `${index}.` : "-", [{ text: sanitizeForPdf(text) }], indent);
          markerUsed = true;
        }
      }
      index += 1;
      this.addSpacing(3);
    }
    this.addSpacing(SPACE_AFTER_BLOCK - 3);
  }

  writeCodeBlock(source: string, indent = 0) {
    this.addSpacing(2);
    const x = MARGIN.left + indent + 10;
    const maxWidth = CONTENT_WIDTH - indent - 20;
    this.doc.setFont("courier", "normal");
    this.doc.setFontSize(FONT_SIZE.code);

    const rawLines = sanitizeForPdf(source).replace(/\t/g, "    ").split("\n");
    const wrapped: string[] = [];
    for (const rawLine of rawLines) {
      if (rawLine.length === 0) {
        wrapped.push("");
        continue;
      }
      const pieces = this.doc.splitTextToSize(rawLine, maxWidth) as string[];
      wrapped.push(...(pieces.length > 0 ? pieces : [""]));
    }

    for (const line of wrapped) {
      this.ensureSpace(LINE_HEIGHT.code);
      this.doc.setFillColor(...COLOR.codeBg);
      this.doc.rect(MARGIN.left + indent, this.cursorY - LINE_HEIGHT.code + 3.5, CONTENT_WIDTH - indent, LINE_HEIGHT.code, "F");
      this.doc.setFillColor(...COLOR.brand);
      this.doc.rect(MARGIN.left + indent, this.cursorY - LINE_HEIGHT.code + 3.5, 2.5, LINE_HEIGHT.code, "F");
      this.doc.setFont("courier", "normal");
      this.doc.setFontSize(FONT_SIZE.code);
      this.doc.setTextColor(...COLOR.codeText);
      this.doc.text(line, x, this.cursorY);
      this.cursorY += LINE_HEIGHT.code;
    }
    this.addSpacing(SPACE_AFTER_BLOCK);
  }

  writeBlockquote(children: RootContent[], indent = 0) {
    this.addSpacing(2);
    for (const child of children) {
      if (child.type === "paragraph") {
        const runs = extractRuns(child.children).map((r) => ({ ...r, italic: true }));
        const startY = this.cursorY;
        this.writeRuns(runs, {
          x: MARGIN.left + indent + 14,
          maxWidth: CONTENT_WIDTH - indent - 14,
          lineHeight: LINE_HEIGHT.body,
          baseSize: FONT_SIZE.body,
          color: COLOR.muted,
        });
        this.doc.setDrawColor(...COLOR.brand);
        this.doc.setLineWidth(2.5);
        this.doc.line(MARGIN.left + indent + 4, startY - LINE_HEIGHT.body + 4, MARGIN.left + indent + 4, this.cursorY - 4);
      } else if (child.type === "list") {
        this.writeList(child, Math.ceil((indent + 14) / LIST_INDENT_STEP));
      } else {
        const text = nodeToPlainText(child).trim();
        if (text) this.writeParagraph([{ text: sanitizeForPdf(text), italic: true }], indent + 14);
      }
    }
    this.addSpacing(SPACE_AFTER_BLOCK - 2);
  }

  writeRule() {
    this.ensureSpace(16);
    this.cursorY += 6;
    this.doc.setDrawColor(...COLOR.rule);
    this.doc.setLineWidth(1);
    this.doc.line(MARGIN.left, this.cursorY, PAGE.width - MARGIN.right, this.cursorY);
    this.cursorY += SPACE_AFTER_BLOCK;
  }

  /** Renders a GFM table as an actual ruled grid — cells wrap and pages break per row. */
  writeTable(table: RootContent) {
    const rows = ((table as { children?: unknown[] }).children ?? []) as { children?: unknown[] }[];
    if (rows.length === 0) return;

    const cellTexts = rows.map((row) => (row.children ?? []).map((cell) => sanitizeForPdf(nodeToPlainText(cell).trim())));
    const columnCount = Math.max(...cellTexts.map((r) => r.length));
    const colWidth = CONTENT_WIDTH / columnCount;
    const cellPad = 5;

    this.addSpacing(2);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(FONT_SIZE.small + 1);

    cellTexts.forEach((cells, rowIndex) => {
      const isHeader = rowIndex === 0;
      const wrappedCells = cells.map((text) =>
        this.doc.splitTextToSize(text || " ", colWidth - cellPad * 2) as string[]
      );
      const rowLines = Math.max(1, ...wrappedCells.map((w) => w.length));
      const rowHeight = rowLines * 13 + cellPad * 2;

      this.ensureSpace(rowHeight);
      const rowTop = this.cursorY - LINE_HEIGHT.small + 2;

      if (isHeader) {
        this.doc.setFillColor(...COLOR.quoteBg);
        this.doc.rect(MARGIN.left, rowTop, CONTENT_WIDTH, rowHeight, "F");
      }

      this.doc.setDrawColor(...COLOR.rule);
      this.doc.setLineWidth(0.75);
      for (let c = 0; c <= columnCount; c++) {
        const x = MARGIN.left + c * colWidth;
        this.doc.line(x, rowTop, x, rowTop + rowHeight);
      }
      this.doc.line(MARGIN.left, rowTop, MARGIN.left + CONTENT_WIDTH, rowTop);
      this.doc.line(MARGIN.left, rowTop + rowHeight, MARGIN.left + CONTENT_WIDTH, rowTop + rowHeight);

      this.doc.setFont("helvetica", isHeader ? "bold" : "normal");
      this.doc.setTextColor(...COLOR.text);
      wrappedCells.forEach((lines, colIndex) => {
        const cellX = MARGIN.left + colIndex * colWidth + cellPad;
        lines.forEach((line, lineIndex) => {
          this.doc.text(line, cellX, rowTop + cellPad + 9 + lineIndex * 13);
        });
      });

      this.cursorY = rowTop + rowHeight + LINE_HEIGHT.small - 2;
    });

    this.addSpacing(SPACE_AFTER_BLOCK);
  }

  /** A small "Section Heading" used inside structured reports (interview/roadmap/resume), visually distinct from Markdown H1-H4. */
  writeSectionHeading(text: string) {
    this.addSpacing(12);
    this.ensureSpace(LINE_HEIGHT.h3 + 6);
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT_SIZE.h3);
    this.doc.setTextColor(...COLOR.career);
    this.doc.text(sanitizeForPdf(text), MARGIN.left, this.cursorY);
    this.cursorY += 4;
    this.doc.setDrawColor(...COLOR.career);
    this.doc.setLineWidth(1.5);
    this.doc.line(MARGIN.left, this.cursorY + 4, MARGIN.left + 28, this.cursorY + 4);
    this.cursorY += 16;
  }

  /** A bordered card of "label: value" rows — used for interview report metadata (role, date, totals). */
  writeMetaCard(rows: { label: string; value: string }[]) {
    if (rows.length === 0) return;
    const rowHeight = 16;
    const padding = 10;
    const cardHeight = rows.length * rowHeight + padding * 2;
    this.ensureSpace(cardHeight + SPACE_AFTER_BLOCK);

    const top = this.cursorY - LINE_HEIGHT.body + 4;
    this.doc.setFillColor(...COLOR.careerSoft);
    this.doc.setDrawColor(...COLOR.rule);
    this.doc.setLineWidth(0.75);
    this.doc.roundedRect(MARGIN.left, top, CONTENT_WIDTH, cardHeight, 4, 4, "FD");

    let y = top + padding + 11;
    for (const row of rows) {
      this.doc.setFont("helvetica", "bold");
      this.doc.setFontSize(FONT_SIZE.body);
      this.doc.setTextColor(...COLOR.text);
      this.doc.text(`${sanitizeForPdf(row.label)}:`, MARGIN.left + padding, y);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(...COLOR.muted);
      this.doc.text(sanitizeForPdf(row.value), MARGIN.left + padding + 130, y);
      y += rowHeight;
    }

    this.cursorY = top + cardHeight + SPACE_AFTER_BLOCK;
  }

  /** A colored score badge (e.g. "82 / 100") used at the top of the interview report. */
  writeScoreBadge(overall: number) {
    this.ensureSpace(70);
    const size = 60;
    const x = MARGIN.left;
    const y = this.cursorY - 10;
    this.doc.setFillColor(...COLOR.career);
    this.doc.circle(x + size / 2, y + size / 2, size / 2, "F");
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(20);
    this.doc.setTextColor(...COLOR.white);
    this.doc.text(String(overall), x + size / 2, y + size / 2 + 7, { align: "center" });

    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT_SIZE.h3);
    this.doc.setTextColor(...COLOR.text);
    this.doc.text(`${overall} / 100`, x + size + 14, y + size / 2 - 4);
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(FONT_SIZE.small);
    this.doc.setTextColor(...COLOR.muted);
    this.doc.text("Overall interview score", x + size + 14, y + size / 2 + 12);

    this.cursorY = y + size + SPACE_AFTER_BLOCK;
  }

  /** A checklist-style bullet with a colored marker — used for strengths/improvements. */
  writeBulletLine(marker: string, text: string, color: [number, number, number]) {
    const runs: Run[] = [{ text: sanitizeForPdf(text) }];
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT_SIZE.body);
    this.ensureSpace(LINE_HEIGHT.body);
    this.doc.setTextColor(...color);
    this.doc.text(marker, MARGIN.left, this.cursorY);
    this.writeRuns(runs, {
      x: MARGIN.left + 18,
      maxWidth: CONTENT_WIDTH - 18,
      lineHeight: LINE_HEIGHT.body,
      baseSize: FONT_SIZE.body,
    });
  }
}

// ── Markdown tree rendering (shared by both document builders) ────────────

function renderMarkdownBlock(writer: PdfWriter, node: RootContent) {
  switch (node.type) {
    case "heading":
      writer.writeHeading(node.depth, extractRuns(node.children));
      break;
    case "paragraph":
      writer.writeParagraph(extractRuns(node.children));
      break;
    case "list":
      writer.writeList(node);
      break;
    case "code":
      writer.writeCodeBlock(node.value);
      break;
    case "blockquote":
      writer.writeBlockquote(node.children);
      break;
    case "thematicBreak":
      writer.writeRule();
      break;
    case "table":
      writer.writeTable(node);
      break;
    case "html":
      break;
    default: {
      const text = nodeToPlainText(node).trim();
      if (text) writer.writeParagraph([{ text: sanitizeForPdf(text) }]);
      break;
    }
  }
}

/** Parses `markdown` and renders every block at the writer's current cursor position. */
export function renderMarkdownTree(writer: PdfWriter, markdown: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as Root;
  for (const node of tree.children) renderMarkdownBlock(writer, node);
}

// ── Footer / filename helpers ──────────────────────────────────────────────

export function drawFootersAndPageNumbers(doc: jsPDF, generatedAt: Date) {
  const total = doc.getNumberOfPages();
  const stamp = generatedAt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(...COLOR.rule);
    doc.setLineWidth(0.75);
    doc.line(MARGIN.left, PAGE.height - MARGIN.bottom + 12, PAGE.width - MARGIN.right, PAGE.height - MARGIN.bottom + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(FONT_SIZE.small);
    doc.setTextColor(...COLOR.faint);
    doc.text(`Generated by Arova AI · ${stamp}`, MARGIN.left, PAGE.height - MARGIN.bottom + 26);
    doc.text(`Page ${i} of ${total}`, PAGE.width - MARGIN.right, PAGE.height - MARGIN.bottom + 26, { align: "right" });
  }
}

export function slugifyForFilename(text: string, fallback: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}
