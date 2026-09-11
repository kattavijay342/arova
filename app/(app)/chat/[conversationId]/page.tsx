"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquareX } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageInput } from "@/components/chat/MessageInput";
import { InterviewProgress } from "@/components/chat/InterviewProgress";
import { QuizProgress } from "@/components/chat/QuizProgress";
import { FullPageLoader } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { MODES } from "@/lib/modes";
import { getInterviewState } from "@/lib/interview";
import { getQuizState } from "@/lib/quiz";
import { getSpeakableReplyText, speak } from "@/lib/speech";
import type { MessageAttachment } from "@/lib/types";

export default function ChatConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const router = useRouter();
  const {
    getConversation,
    ensureMessagesLoaded,
    sendMessage,
    generateImage,
    isStreaming,
    imageGenerating,
    hydrated,
    stopGenerating,
  } = useChat();
  const [draft, setDraft] = useState("");
  // Set right after sending a message that voice input contributed to (see
  // MessageInput's wasVoiceComposed) — the effect below watches for the
  // reply that answers it to fully arrive, then reads it aloud, closing the
  // loop into more of a voice conversation rather than requiring a manual
  // tap on "Listen" every time.
  const [autoSpeakNextReply, setAutoSpeakNextReply] = useState(false);
  const lastAutoSpokenMessageIdRef = useRef<string | null>(null);

  const conversation = getConversation(conversationId);

  // Conversations are hydrated lightweight (no messages) — this fetches the
  // real ones the first time a given conversation is actually opened. A
  // no-op once loaded, so navigating back to an already-open conversation
  // doesn't re-fetch. See Conversation.messagesLoaded.
  useEffect(() => {
    if (conversation && !conversation.messagesLoaded) {
      void ensureMessagesLoaded(conversationId);
    }
  }, [conversationId, conversation, ensureMessagesLoaded]);

  // `isStreaming` only goes back to false once a reply has fully finished
  // (successfully, errored, or stopped) — see ChatContext's ChatState.
  // isStreaming doc comment — so this fires exactly once per voice-composed
  // send, after the real content is in, not mid-stream on a growing partial
  // bubble. `lastAutoSpokenMessageIdRef` guards against a double-fire (e.g.
  // React Strict Mode's dev-only double effect run) speaking the same reply
  // twice.
  useEffect(() => {
    if (!autoSpeakNextReply || !conversation || isStreaming) return;
    const last = conversation.messages[conversation.messages.length - 1];
    if (last && last.role === "assistant" && last.id !== lastAutoSpokenMessageIdRef.current) {
      lastAutoSpokenMessageIdRef.current = last.id;
      setAutoSpeakNextReply(false);
      speak(getSpeakableReplyText(last.content), () => {});
    }
  }, [autoSpeakNextReply, conversation, isStreaming]);

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

  // Never render the composer/message list against a conversation whose
  // real messages haven't arrived yet — sending into it here would
  // misdetect "first message" (retitling an existing conversation) and
  // MessageList would briefly flash its empty-chat state for a chat that
  // actually has history.
  if (!conversation.messagesLoaded) {
    return <FullPageLoader label="Loading conversation…" />;
  }

  function handleSend(
    text: string,
    attachment?: MessageAttachment | null,
    webSearch?: boolean,
    deepResearch?: boolean,
    jobFitAnalysis?: boolean,
    wasVoiceComposed?: boolean
  ) {
    if ((!text.trim() && !attachment) || isStreaming || imageGenerating) return;
    setDraft("");
    if (wasVoiceComposed) setAutoSpeakNextReply(true);
    void sendMessage(conversationId, text, attachment, webSearch, deepResearch, jobFitAnalysis);
  }

  function handleGenerateImage(prompt: string) {
    if (!prompt.trim() || isStreaming || imageGenerating) return;
    void generateImage(conversationId, prompt);
  }

  const interviewState = conversation.mode === "career" ? getInterviewState(conversation.messages) : null;
  const quizState = conversation.mode === "student" ? getQuizState(conversation.messages) : null;

  return (
    <div className="flex h-full flex-col">
      <ChatHeader conversation={conversation} />
      {interviewState && <InterviewProgress state={interviewState} />}
      {quizState && <QuizProgress state={quizState} />}
      <MessageList conversation={conversation} onSelectPrompt={setDraft} />
      <MessageInput
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        onGenerateImage={handleGenerateImage}
        mode={conversation.mode}
        disabled={isStreaming || imageGenerating}
        isStreaming={isStreaming}
        onStop={stopGenerating}
        placeholder={`Ask anything in ${MODES[conversation.mode].shortLabel} Mode…`}
      />
    </div>
  );
}
