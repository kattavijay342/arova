"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { MODES } from "@/lib/modes";
import { getInterviewState, extractScore } from "@/lib/interview";
import { formatRelativeDay } from "@/lib/utils";

export function RecentConversations() {
  const { conversations } = useChat();
  const recent = [...conversations].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 6);

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center text-muted">
        <MessageSquare className="h-6 w-6 text-faint" aria-hidden />
        <p className="text-[15px]">No conversations yet. Pick a mode above to start your first chat.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface">
      {recent.map((c) => {
        const mode = MODES[c.mode];
        const interview = c.mode === "career" ? getInterviewState(c.messages) : null;

        let metaRight: string;
        if (interview?.complete) {
          const score = extractScore(c.messages);
          metaRight = `${score !== null ? `${score}/100` : "Completed"} • Completed`;
        } else if (interview) {
          metaRight = `In Progress • Question ${interview.currentQuestion}/${interview.total}`;
        } else {
          metaRight = `${c.messages.length} ${c.messages.length === 1 ? "message" : "messages"}`;
        }

        return (
          <Link
            key={c.id}
            href={`/chat/${c.id}`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-border-soft"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-text">{c.title}</p>
              <p className="mt-0.5 truncate text-[13px]">
                <span className="font-semibold" style={{ color: mode.color }}>
                  {mode.shortLabel}
                </span>
                <span className="text-faint"> • </span>
                <span className={interview && !interview.complete ? "font-medium text-career" : "text-muted"}>
                  {metaRight}
                </span>
              </p>
            </div>
            <span className="flex-none font-mono text-[13px] text-faint">{formatRelativeDay(c.updatedAt)}</span>
          </Link>
        );
      })}
    </div>
  );
}
