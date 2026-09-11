"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, RotateCcw, FileText, Download, Loader2 } from "lucide-react";
import type { ScoreData } from "@/lib/interview";
import { extractInterviewTranscript } from "@/lib/interview";
import { MODES } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { useChat } from "@/lib/context/ChatContext";

type PdfState = "idle" | "generating" | "error";

export function InterviewResultsCard({ data, conversationId }: { data: ScoreData; conversationId: string }) {
  const router = useRouter();
  const { createConversation, getConversation } = useChat();
  const career = MODES.career;
  const [pdfState, setPdfState] = useState<PdfState>("idle");

  function handlePracticeAgain() {
    const id = createConversation("career");
    router.push(`/chat/${id}`);
  }

  function handleViewDetails(e: React.MouseEvent<HTMLButtonElement>) {
    e.currentTarget.closest("main")?.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleExportReport() {
    if (pdfState === "generating") return;
    setPdfState("generating");
    try {
      const conversation = getConversation(conversationId);
      const transcript = conversation ? extractInterviewTranscript(conversation.messages) : null;
      if (!transcript) throw new Error("Interview transcript is not available.");

      // Code-split: jsPDF and the markdown parser it needs are only fetched
      // when a user actually exports a report.
      const { exportInterviewReportPdf } = await import("@/lib/pdf/exportInterviewReportPdf");
      await exportInterviewReportPdf(transcript);
      setPdfState("idle");
    } catch (err) {
      console.error("[pdf] interview report export failed:", err);
      setPdfState("error");
      setTimeout(() => setPdfState("idle"), 3000);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-soft">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
        Interview Complete <span aria-hidden>🎉</span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex h-20 w-20 flex-none items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: career.color }}
        >
          {data.overall}
        </div>
        <div>
          <p className="text-2xl font-bold text-text">
            {data.overall}
            <span className="text-base font-medium text-muted"> / 100</span>
          </p>
          <p className="text-[13px] text-muted">Overall score</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {data.categories.map((c) => (
          <div key={c.name}>
            <div className="mb-1 flex items-center justify-between text-[13px]">
              <span className="font-medium text-text">{c.name}</span>
              <span className="font-mono text-faint">{c.score}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-soft">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${c.score}%`, backgroundColor: career.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {data.wellDone.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[13px] font-semibold text-text">What you did well</p>
          <ul className="flex flex-col gap-1">
            {data.wellDone.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[13px] text-muted">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-general" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.improve.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-semibold text-text">Improve next time</p>
          <ul className="flex flex-col gap-1">
            {data.improve.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[13px] text-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-career" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 border-t border-border-soft pt-4 sm:flex-row">
        <button
          onClick={handlePracticeAgain}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ backgroundColor: career.color }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Practice Again
        </button>
        <button
          onClick={handleViewDetails}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-border-soft"
        >
          <FileText className="h-3.5 w-3.5" aria-hidden />
          View Detailed Report
        </button>
      </div>
      <button
        type="button"
        onClick={handleExportReport}
        disabled={pdfState === "generating"}
        aria-label="Export Interview Report PDF"
        aria-busy={pdfState === "generating"}
        className={cn(
          "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-border-soft",
          pdfState === "generating" && "cursor-not-allowed opacity-60"
        )}
      >
        {pdfState === "generating" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden />
        )}
        {pdfState === "generating" ? "Generating PDF..." : "Export Interview Report PDF"}
      </button>
      {pdfState === "error" && (
        <p role="status" className="mt-2 text-center text-[13px] text-danger">
          Unable to generate PDF. Please try again.
        </p>
      )}
      <p className="mt-3 text-center text-[13px] text-faint">
        AI-generated feedback based on your answers — scores may vary between practice runs.
      </p>
    </div>
  );
}
