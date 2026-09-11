import { jsPDF } from "jspdf";
import type { InterviewTranscript } from "@/lib/interview";
import {
  PAGE,
  MARGIN,
  COLOR,
  FONT_SIZE,
  PdfWriter,
  renderMarkdownTree,
  drawFootersAndPageNumbers,
  slugifyForFilename,
  sanitizeForPdf,
} from "./pdfEngine";

/**
 * Builds and downloads a Career Mode "Mock Interview Report" PDF from the
 * conversation's own message history — every field is read from the actual
 * transcript (`lib/interview.ts`'s `extractInterviewTranscript`); nothing is
 * invented. A section is simply omitted when that data isn't present (e.g.
 * an interview abandoned before the AI produced a score).
 */

const HEADER_LABEL = "Career Mode — Mock Interview Report";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function drawReportHeader(writer: PdfWriter, transcript: InterviewTranscript) {
  const { doc } = writer;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLOR.brand);
  doc.text("AROVA AI", MARGIN.left, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.muted);
  doc.text("Career Mode", MARGIN.left, 59);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(FONT_SIZE.h2);
  doc.setTextColor(...COLOR.text);
  doc.text("Mock Interview Report", MARGIN.left, 80);

  doc.setDrawColor(...COLOR.rule);
  doc.setLineWidth(1);
  doc.line(MARGIN.left, 90, PAGE.width - MARGIN.right, 90);

  writer.cursorY = 90 + 26;

  const metaRows = [
    { label: "Role / Interview Type", value: transcript.role || "General" },
    { label: "Interview Date", value: formatDate(transcript.startedAt) },
    {
      label: "Status",
      value: transcript.completedAt ? `Completed on ${formatDate(transcript.completedAt)}` : "In progress",
    },
    { label: "Total Questions", value: `${transcript.questions.length} asked` },
  ];
  writer.writeMetaCard(metaRows);
}

function buildInterviewReportPdf(transcript: InterviewTranscript): jsPDF {
  const writer = new PdfWriter(HEADER_LABEL);
  drawReportHeader(writer, transcript);

  if (transcript.score) {
    writer.writeScoreBadge(transcript.score.overall);

    if (transcript.score.categories.length > 0) {
      writer.writeSectionHeading("Score Breakdown");
      writer.writeMetaCard(
        transcript.score.categories.map((c) => ({ label: c.name, value: `${c.score} / 100` }))
      );
    }

    if (transcript.score.wellDone.length > 0) {
      writer.writeSectionHeading("Strengths");
      for (const item of transcript.score.wellDone) writer.writeBulletLine("+", item, COLOR.good);
      writer.addSpacing(10);
    }

    if (transcript.score.improve.length > 0) {
      writer.writeSectionHeading("Areas for Improvement");
      for (const item of transcript.score.improve) writer.writeBulletLine("!", item, COLOR.career);
      writer.addSpacing(10);
    }
  } else {
    writer.writeSectionHeading("Status");
    writer.writeParagraph([
      { text: "This interview hasn't been completed yet, so a score and feedback aren't available." },
    ]);
  }

  if (transcript.questions.length > 0) {
    writer.writeSectionHeading("Interview Questions & Answers");
    for (const qa of transcript.questions) {
      writer.addSpacing(4);
      writer.writeHeading(4, [{ text: `Question ${qa.number}`, bold: true }]);
      renderMarkdownTree(writer, qa.interviewerMessage);

      writer.addSpacing(2);
      writer.writeParagraph([{ text: "Your Answer", bold: true }]);
      if (qa.answer) {
        renderMarkdownTree(writer, qa.answer);
      } else {
        writer.writeParagraph([{ text: "No answer recorded for this question.", italic: true }]);
      }
      writer.writeRule();
    }
  }

  if (transcript.finalRemarks) {
    writer.writeSectionHeading("Final Summary");
    renderMarkdownTree(writer, transcript.finalRemarks);
  } else if (transcript.score) {
    writer.writeSectionHeading("Final Summary");
    writer.writeParagraph([
      {
        text: sanitizeForPdf(
          `This candidate answered ${transcript.questions.length} question${transcript.questions.length === 1 ? "" : "s"} and scored ${transcript.score.overall} out of 100 overall.`
        ),
      },
    ]);
  }

  drawFootersAndPageNumbers(writer.doc, new Date());
  return writer.doc;
}

/**
 * Builds and downloads the Mock Interview Report PDF. Throws if the
 * conversation doesn't contain a recognizable interview, so the caller can
 * show "Unable to generate PDF. Please try again."
 */
export async function exportInterviewReportPdf(transcript: InterviewTranscript): Promise<void> {
  if (!transcript || transcript.questions.length === 0) {
    throw new Error("There's no interview data to export yet.");
  }

  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

  const doc = buildInterviewReportPdf(transcript);
  const roleSlug = slugifyForFilename(transcript.role, "interview");
  doc.save(`Arova-Interview-Report-${roleSlug}.pdf`);
}
