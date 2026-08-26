"use client";

import { useEffect, useRef } from "react";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/lib/context/ChatContext";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { ChatErrorState } from "./ErrorState";
import { EmptyChatState } from "./EmptyChatState";

export function MessageList({
  conversation,
  onSelectPrompt,
}: {
  conversation: Conversation;
  onSelectPrompt: (prompt: string) => void;
}) {
  const { status, error, submitFeedback } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation.messages.length, status]);

  if (conversation.messages.length === 0 && status !== "loading") {
    return <EmptyChatState mode={conversation.mode} onSelectPrompt={onSelectPrompt} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-5 py-6 sm:px-8">
      {conversation.messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          mode={conversation.mode}
          conversationId={conversation.id}
          onFeedback={submitFeedback}
        />
      ))}
      {status === "loading" && <TypingIndicator mode={conversation.mode} />}
      {status === "error" && error && <ChatErrorState message={error} />}
      <div ref={bottomRef} />
    </div>
  );
}
