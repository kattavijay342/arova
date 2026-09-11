"use client";

import { useEffect, useRef } from "react";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/lib/context/ChatContext";
import { parseDocumentMessage } from "@/lib/document";
import { parseDatasetMessage } from "@/lib/dataset";
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
    isStreaming,
    searchingWeb,
    error,
    submitFeedback,
    editMessage,
    deleteMessage,
    regenerateResponse,
    generateImage,
    imageGenerating,
    imageGenerationError,
    dismissImageGenerationError,
  } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Covers the *entire* duration of a streaming reply (unlike `status`,
  // which flips back to "idle" once the first chunk arrives) — used to
  // disable editing/deleting/regenerating other messages while one is
  // actively being generated, not just during the brief pre-first-chunk
  // window.
  const disableActions = isStreaming || imageGenerating;

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

        // Regenerating resends the preceding user message's saved text
        // as-is — fine for a document/dataset (its extracted text is
        // already embedded in that text), but an image attachment's actual
        // pixels are never resent to the AI on a later turn (see
        // lib/types.ts's ImageAttachment comment), so resending would
        // silently lose it and generate a reply blind to what was actually
        // asked. Same restriction Edit already applies, for the same
        // reason — including for a *reloaded* image message, which has no
        // `imageDataUrl` (client-only, lost on reload) but is recognizable
        // as an image by having `hasFileAttachment` with no document/dataset
        // marker (see lib/server/storage.ts / PersistedImageAttachment).
        const precedingHasDocumentOrDataset = Boolean(
          precedingUserMessage &&
            (precedingUserMessage.documentMeta ||
              precedingUserMessage.datasetMeta ||
              precedingDocument ||
              parseDatasetMessage(precedingUserMessage.content))
        );
        const precedingHasAttachment = Boolean(
          precedingUserMessage &&
            (precedingUserMessage.imageDataUrl || precedingHasDocumentOrDataset || precedingUserMessage.hasFileAttachment)
        );
        // Regeneration only ever applies to the conversation's last message
        // — this app has no branching history, so regenerating an earlier
        // reply would leave it sitting in front of messages that already
        // responded to it.
        const showRegenerate = index === conversation.messages.length - 1 && !precedingHasAttachment;

        return (
          <MessageBubble
            key={message.id}
            message={message}
            mode={conversation.mode}
            conversationId={conversation.id}
            onFeedback={submitFeedback}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onRegenerate={showRegenerate ? regenerateResponse : undefined}
            onGenerateImage={generateImage}
            imageGenerating={imageGenerating}
            disableActions={disableActions}
            questionContent={questionContent}
          />
        );
      })}
      {status === "loading" && (
        <TypingIndicator
          mode={conversation.mode}
          label={
            searchingWeb === "deep"
              ? "Researching…"
              : searchingWeb === "web"
                ? "Searching the web…"
                : searchingWeb === "data"
                  ? "Analyzing data…"
                  : undefined
          }
        />
      )}
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
