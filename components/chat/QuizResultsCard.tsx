"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { QuizScoreData } from "@/lib/quiz";
import { MODES } from "@/lib/modes";
import { useChat } from "@/lib/context/ChatContext";

/**
 * Mirrors InterviewResultsCard.tsx's design for the Career mode mock
 * interview, for the Student mode practice quiz flow. Scoped smaller (no
 * PDF export) — quiz results are quick, frequent, and disposable in a way a
 * one-time interview report isn't; export can follow later if wanted.
 */
export function QuizResultsCard({ data }: { data: QuizScoreData }) {
  const router = useRouter();
  const { createConversation } = useChat();
  const student = MODES.student;

  function handlePracticeAgain() {
    const id = createConversation("student");
    router.push(`/chat/${id}`);
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-soft">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
        Quiz Complete <span aria-hidden>🎉</span>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex h-20 w-20 flex-none items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: student.color }}
        >
          {data.score}/{data.total}
        </div>
        <div>
          <p className="text-2xl font-bold text-text">
            {Math.round((data.score / data.total) * 100)}
            <span className="text-base font-medium text-muted">%</span>
          </p>
          <p className="text-[13px] text-muted">{data.subject}</p>
        </div>
      </div>

      {data.review.length > 0 && (
        <div className="mt-5 flex flex-col gap-1.5">
          {data.review.map((item, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[13px] text-muted">
              {item.correct ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-general" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none text-danger" aria-hidden />
              )}
              {item.label}
            </div>
          ))}
        </div>
      )}

      {data.tip && (
        <div className="mt-4 rounded-lg border border-border-soft bg-surface px-3 py-2.5 text-[13px] text-muted">
          <span className="font-semibold text-text">Tip: </span>
          {data.tip}
        </div>
      )}

      <button
        onClick={handlePracticeAgain}
        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
        style={{ backgroundColor: student.color }}
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        Practice Another Topic
      </button>
      <p className="mt-3 text-center text-[13px] text-faint">
        AI-generated feedback based on your answers — scores may vary between attempts.
      </p>
    </div>
  );
}
