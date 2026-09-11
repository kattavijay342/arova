"use client";

import { useEffect, useRef } from "react";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/lib/context/ChatContext";
import { parseDocumentMessage } from "@/lib/document";
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
  const {
    status,
    error,
    submitFeedback,
    editMessage,
    deleteMessage,
    generateImage,
    imageGenerating,
    imageGenerationError,
    dismissImageGenerationError,
  } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation.messages.length, status]);

  if (conversation.messages.length === 0 && status !== "loading") {
    return <EmptyChatState mode={conversation.mode} onSelectPrompt={onSelectPrompt} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-5 py-6 sm:px-8">
      {conversation.messages.map((message, index) => {
        // The preceding user turn, used as the "Topic" line when exporting
        // this assistant reply to PDF — undefined for user bubbles (unused there).
        // A document-bearing message uses its caption (or filename, if the
        // user attached a file with no caption) instead of the raw
        // `[[document: ...]]` block full of extracted text.
        const precedingUserMessage =
          message.role === "assistant"
            ? conversation.messages
                .slice(0, index)
                .reverse()
                .find((m) => m.role === "user")
            : undefined;
        const precedingDocument = precedingUserMessage ? parseDocumentMessage(precedingUserMessage.content) : null;
        const questionContent = precedingUserMessage
          ? precedingDocument
            ? precedingDocument.caption || precedingDocument.meta.filename
            : precedingUserMessage.content
          : undefined;

        return (
          <MessageBubble
            key={message.id}
            message={message}
            mode={conversation.mode}
            conversationId={conversation.id}
            onFeedback={submitFeedback}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onGenerateImage={generateImage}
            imageGenerating={imageGenerating}
            disableActions={status === "loading" || imageGenerating}
            questionContent={questionContent}
          />
        );
      })}
      {status === "loading" && <TypingIndicator mode={conversation.mode} />}
      {imageGenerating && <TypingIndicator mode={conversation.mode} label="Generating image…" />}
      {status === "error" && error && <ChatErrorState message={error} />}
      {imageGenerationError && (
        <ChatErrorState
          title="Couldn't generate the image"
          message={imageGenerationError}
          onRetry={() => {
            const lastUserMessage = [...conversation.messages].reverse().find((m) => m.role === "user");
            if (lastUserMessage) generateImage(conversation.id, lastUserMessage.content);
          }}
          onDismiss={dismissImageGenerationError}
          retryDisabled={imageGenerating}
        />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
