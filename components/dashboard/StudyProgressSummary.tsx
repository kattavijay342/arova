"use client";

import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { getCompletedQuizSummary } from "@/lib/quiz";
import { cn, formatRelativeDay } from "@/lib/utils";
import { MODES } from "@/lib/modes";

/**
 * Cross-conversation quiz history — the Student mode counterpart to
 * CareerProgressSummary.tsx. Renders nothing until at least one practice
 * quiz has been completed, and relies on the caller having already loaded
 * messages for the student-mode conversations passed in — it never fetches
 * anything itself. Deliberately scoped to whatever conversations the caller
 * hands it (bounded to the most recent ones — see
 * app/(app)/dashboard/page.tsx) rather than a user's entire history, for the
 * same reason lib/server/studyProgress.ts bounds its own query: a student
 * can accumulate far more Student mode conversations over time than a
 * Career mode user accumulates interviews.
 */
export function StudyProgressSummary({ conversations }: { conversations: Conversation[] }) {
  const completed = conversations
    .filter((c) => c.mode === "student")
    .map((c) => {
      const summary = getCompletedQuizSummary(c.messages);
      return summary ? { conversationId: c.id, ...summary } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  if (completed.length === 0) return null;

  const averagePercent = Math.round(
    (completed.reduce((sum, c) => sum + c.score / c.total, 0) / completed.length) * 100
  );
  const [latest, previous] = completed;
  const latestPercent = Math.round((latest.score / latest.total) * 100);
  const previousPercent = previous ? Math.round((previous.score / previous.total) * 100) : null;
  const trend = previousPercent !== null ? latestPercent - previousPercent : null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-lg font-semibold text-text">Study progress</h2>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-2xl font-bold text-text">{completed.length}</p>
            <p className="text-[13px] text-muted">{completed.length === 1 ? "Quiz" : "Quizzes"} completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-text">
              {averagePercent}
              <span className="text-base font-medium text-muted">%</span>
            </p>
            <p className="text-[13px] text-muted">Average score</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-bold text-text">
                {latestPercent}
                <span className="text-base font-medium text-muted">%</span>
              </p>
              {trend !== null && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-sm font-semibold",
                    trend > 0 ? "text-general" : trend < 0 ? "text-danger" : "text-faint"
                  )}
                >
                  {trend > 0 ? (
                    <TrendingUp className="h-4 w-4" aria-hidden />
                  ) : trend < 0 ? (
                    <TrendingDown className="h-4 w-4" aria-hidden />
                  ) : (
                    <Minus className="h-4 w-4" aria-hidden />
                  )}
                  {trend !== 0 && `${Math.abs(trend)}%`}
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted">Latest score{previous ? " vs. previous" : ""}</p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-border-soft border-t border-border-soft">
          {completed.slice(0, 5).map((entry) => (
            <Link
              key={entry.conversationId}
              href={`/chat/${entry.conversationId}`}
              className="flex items-center justify-between gap-3 py-2.5 text-[14px] hover:opacity-80"
            >
              <span className="font-medium text-text">{entry.subject}</span>
              <span className="flex flex-none items-center gap-3 text-[13px]">
                <span className="font-mono font-semibold" style={{ color: MODES.student.color }}>
                  {entry.score}/{entry.total}
                </span>
                <span className="text-faint">{formatRelativeDay(entry.completedAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
