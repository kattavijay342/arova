"use client";

import { memo, useMemo, useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp, User } from "lucide-react";
import type { FeedbackRating, Message, Mode } from "@/lib/types";
import { MODES } from "@/lib/modes";
import { cn, formatTime } from "@/lib/utils";
import { parseScoreCard } from "@/lib/interview";
import { MessageContent } from "./MessageContent";
import { InterviewResultsCard } from "./InterviewResultsCard";

const SCORE_MARKER = "Interview Complete";

function MessageBubbleImpl({
  message,
  mode,
  conversationId,
  onFeedback,
}: {
  message: Message;
  mode: Mode;
  conversationId: string;
  onFeedback: (conversationId: string, messageId: string, rating: FeedbackRating) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const modeConfig = MODES[mode];
  const Icon = modeConfig.icon;

  // Only re-parsed when this message's own content changes (not on every
  // re-render) — during AI streaming, most bubbles in a conversation aren't
  // the one being updated, so this stays cached for them.
  const scoreData = useMemo(() => (isUser ? null : parseScoreCard(message.content)), [isUser, message.content]);
  const preScoreContent = scoreData ? message.content.slice(0, message.content.indexOf(SCORE_MARKER)).trim() : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore in this mock UI
    }
  }

  return (
    <div className={cn("flex items-start gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <span
        className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-white shadow-soft"
        style={{ backgroundColor: isUser ? "var(--color-brand)" : modeConfig.color }}
        aria-hidden
      >
        {isUser ? <User className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </span>
      <div className={cn("group flex max-w-[80%] flex-col gap-1", isUser ? "items-end" : "items-start")}>
        {!isUser && (
          <span
            className="px-1 font-mono text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: modeConfig.color }}
          >
            {modeConfig.assistantLabel}
          </span>
        )}
        {scoreData ? (
          <div className="flex w-full flex-col gap-3">
            {preScoreContent && (
              <div
                className="rounded-2xl rounded-tl-sm border-2 bg-surface-raised px-4 py-3 text-text"
                style={{ borderColor: modeConfig.colorSoft }}
              >
                <MessageContent content={preScoreContent} />
              </div>
            )}
            <InterviewResultsCard data={scoreData} />
          </div>
        ) : (
          <div
            className={cn(
              "rounded-2xl px-4 py-3",
              isUser
                ? "rounded-tr-sm bg-brand text-white"
                : "rounded-tl-sm border-2 bg-surface-raised text-text"
            )}
            style={!isUser ? { borderColor: modeConfig.colorSoft } : undefined}
          >
            <MessageContent content={message.content} />
          </div>
        )}
        <div className={cn("flex items-center gap-2.5 px-1 text-[13px] text-faint", isUser && "flex-row-reverse")}>
          <span>{formatTime(message.createdAt)}</span>
          {!isUser && (
            <>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={() => onFeedback(conversationId, message.id, "up")}
                aria-label="Good response"
                aria-pressed={message.feedback === "up"}
                className={cn(
                  "flex items-center transition-opacity hover:text-text",
                  message.feedback === "up" ? "text-general" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <ThumbsUp className="h-3.5 w-3.5" fill={message.feedback === "up" ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => onFeedback(conversationId, message.id, "down")}
                aria-label="Bad response"
                aria-pressed={message.feedback === "down"}
                className={cn(
                  "flex items-center transition-opacity hover:text-text",
                  message.feedback === "down" ? "text-danger" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <ThumbsDown className="h-3.5 w-3.5" fill={message.feedback === "down" ? "currentColor" : "none"} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// During AI streaming, only the one bubble whose content is growing should
// re-render — memoized so the rest of the conversation's bubbles bail out
// instead of re-rendering (and re-running parseScoreCard) on every chunk.
export const MessageBubble = memo(MessageBubbleImpl);
