"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { MODES } from "@/lib/modes";
import { getInterviewState, extractScore } from "@/lib/interview";
import { getQuizState, extractQuizScore } from "@/lib/quiz";
import { formatRelativeDay } from "@/lib/utils";

export function RecentConversations() {
  const { conversations, ensureMessagesLoaded } = useChat();
  const recent = [...conversations].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 6);
  const recentIds = recent.map((c) => c.id).join(",");

  // The conversation list is hydrated lightweight (no messages — see
  // Conversation.messagesLoaded), but this widget needs real messages to
  // show interview progress/score and message counts. Bounded to the
  // handful of conversations shown here, so it doesn't reintroduce the
  // "every conversation's full history on every page load" cost that was
  // split out (see lib/context/ChatContext.tsx / app/api/conversations/route.ts).
  useEffect(() => {
    for (const id of recentIds ? recentIds.split(",") : []) {
      void ensureMessagesLoaded(id);
    }
  }, [recentIds, ensureMessagesLoaded]);

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
        const quiz = c.mode === "student" ? getQuizState(c.messages) : null;

        let metaRight: string;
        let inProgress = false;
        if (interview?.complete) {
          const score = extractScore(c.messages);
          metaRight = `${score !== null ? `${score}/100` : "Completed"} • Completed`;
        } else if (interview) {
          metaRight = `In Progress • Question ${interview.currentQuestion}/${interview.total}`;
          inProgress = true;
        } else if (quiz?.complete) {
          const result = extractQuizScore(c.messages);
          metaRight = `${result ? `${result.score}/${result.total}` : "Completed"} • Completed`;
        } else if (quiz) {
          metaRight = `In Progress • Question ${quiz.currentQuestion}/${quiz.total}`;
          inProgress = true;
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
                <span className={inProgress ? "font-medium" : "text-muted"} style={inProgress ? { color: mode.color } : undefined}>
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
