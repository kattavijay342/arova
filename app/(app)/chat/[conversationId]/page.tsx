"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquareX } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { InterviewProgress } from "@/components/chat/InterviewProgress";
import { FullPageLoader } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { MODES } from "@/lib/modes";
import { getInterviewState } from "@/lib/interview";
import type { MessageAttachment } from "@/lib/types";

export default function ChatConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const { getConversation, sendMessage, generateImage, status, imageGenerating, hydrated } = useChat();
  const [draft, setDraft] = useState("");

  const conversation = getConversation(conversationId);

  if (!hydrated) {
    return <FullPageLoader label="Loading conversation…" />;
  }

  if (!conversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <MessageSquareX className="h-8 w-8 text-faint" aria-hidden />
        <h1 className="font-display text-lg font-semibold text-text">Conversation not found</h1>
        <p className="max-w-sm text-sm text-muted">
          This chat may have been deleted. Start a new one instead.
        </p>
        <Button onClick={() => router.push("/chat")}>Start a new chat</Button>
      </div>
    );
  }

  function handleSend(
    text: string,
    attachment?: MessageAttachment | null,
    webSearch?: boolean,
    deepResearch?: boolean,
    jobFitAnalysis?: boolean
  ) {
    if ((!text.trim() && !attachment) || status === "loading" || imageGenerating) return;
    setDraft("");
    void sendMessage(conversationId, text, attachment, webSearch, deepResearch, jobFitAnalysis);
  }

  function handleGenerateImage(prompt: string) {
    if (!prompt.trim() || status === "loading" || imageGenerating) return;
    void generateImage(conversationId, prompt);
  }

  const interviewState = conversation.mode === "career" ? getInterviewState(conversation.messages) : null;

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} />
      {interviewState && <InterviewProgress state={interviewState} />}
      <MessageList conversation={conversation} onSelectPrompt={setDraft} />
      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onGenerateImage={handleGenerateImage}
        mode={conversation.mode}
        disabled={status === "loading" || imageGenerating}
        placeholder={`Ask anything in ${MODES[conversation.mode].shortLabel} Mode…`}
      />
    </div>
  );
}
