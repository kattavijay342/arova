"use client";

import { useRouter } from "next/navigation";
import type { QuizState } from "@/lib/quiz";
import { MODES } from "@/lib/modes";

/** Mirrors InterviewProgress.tsx's design for the Career mode mock interview, for the Student mode practice quiz flow. */
export function QuizProgress({ state }: { state: QuizState }) {
  const router = useRouter();
  const pct = state.complete ? 100 : Math.round(((state.currentQuestion - 1) / state.total) * 100);
  const modeConfig = MODES.student;

  function handleEnd() {
    if (window.confirm("End this quiz? Your progress will be saved.")) {
      router.push("/dashboard");
    }
  }

  return (
    <div className="border-b border-border-soft bg-student-soft px-5 py-4 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-student">Practice Quiz</p>
            <p className="mt-0.5 text-lg font-semibold text-text sm:text-xl">{state.subject}</p>
          </div>
          {!state.complete && (
            <button
              onClick={handleEnd}
              className="flex-none rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-danger hover:text-danger"
            >
              End Quiz
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="flex-none whitespace-nowrap font-mono text-sm font-semibold text-student">
            {state.complete ? "Complete" : `Question ${state.currentQuestion} of ${state.total}`}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, backgroundColor: modeConfig.color }}
            />
          </div>
          <span className="flex-none font-mono text-xs text-faint">{pct}%</span>
        </div>
      </div>
    </div>
  );
}
