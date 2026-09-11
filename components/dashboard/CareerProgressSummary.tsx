"use client";

import Link from "next/link";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { getCompletedInterviewSummary } from "@/lib/interview";
import { cn, formatRelativeDay } from "@/lib/utils";
import { MODES } from "@/lib/modes";

/**
 * Cross-conversation interview history — the app's "Career Progress
 * Tracking" differentiator. A single completed interview already gets its
 * own results card inside that conversation; this aggregates every
 * completed interview across all of the user's career-mode conversations so
 * improvement over time is visible without hunting through past chats.
 *
 * Renders nothing until at least one interview has been completed, and
 * relies on the caller having already loaded messages for career-mode
 * conversations (see app/(app)/dashboard/page.tsx) — it never fetches
 * anything itself.
 */
export function CareerProgressSummary({ conversations }: { conversations: Conversation[] }) {
  const completed = conversations
    .filter((c) => c.mode === "career")
    .map((c) => {
      const summary = getCompletedInterviewSummary(c.messages);
      return summary ? { conversationId: c.id, ...summary } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  if (completed.length === 0) return null;

  const average = Math.round(completed.reduce((sum, c) => sum + c.score, 0) / completed.length);
  const [latest, previous] = completed;
  const trend = previous ? latest.score - previous.score : null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-lg font-semibold text-text">Career progress</h2>
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-2xl font-bold text-text">{completed.length}</p>
            <p className="text-[13px] text-muted">{completed.length === 1 ? "Interview" : "Interviews"} completed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-text">
              {average}
              <span className="text-base font-medium text-muted"> / 100</span>
            </p>
            <p className="text-[13px] text-muted">Average score</p>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-bold text-text">
                {latest.score}
                <span className="text-base font-medium text-muted"> / 100</span>
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
                  {trend !== 0 && Math.abs(trend)}
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
              <span className="font-medium text-text">{entry.role}</span>
              <span className="flex flex-none items-center gap-3 text-[13px]">
                <span className="font-mono font-semibold" style={{ color: MODES.career.color }}>
                  {entry.score}/100
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
