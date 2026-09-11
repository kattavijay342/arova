"use client";

import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BrainCircuit, Check, Copy, Download, Loader2, Pencil, Square, ThumbsDown, ThumbsUp, Trash2, User, Volume2 } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import type { FeedbackRating, Message, Mode } from "@/lib/types";
import { MODES } from "@/lib/modes";
import { cn, formatTime } from "@/lib/utils";
import { parseScoreCard } from "@/lib/interview";
import { resolveCareerExportKind, parseJobFitAnalysis } from "@/lib/career";
import { parseDocumentMessage } from "@/lib/document";
import { parseDatasetMessage } from "@/lib/dataset";
import { parseGeneratedImageMessage } from "@/lib/generatedImage";
import { parseSearchCitationsMessage } from "@/lib/searchCitations";
import { isSpeechSynthesisSupported, speak, stopSpeaking, stripMarkdownForSpeech } from "@/lib/speech";
import { MessageContent } from "./MessageContent";
import { InterviewResultsCard } from "./InterviewResultsCard";
import { JobFitAnalysisCard } from "./JobFitAnalysisCard";
import { DocumentAttachmentChip } from "./DocumentAttachmentChip";
import { DatasetAttachmentChip } from "./DatasetAttachmentChip";
import { GeneratedImageCard } from "./GeneratedImageCard";
import { SearchSourcesCard } from "./SearchSourcesCard";

const SCORE_MARKER = "Interview Complete";
const JOB_FIT_HEADING = "Job Fit Analysis";

type PdfState = "idle" | "generating" | "error";

/** Which "Export ... PDF" button/label to show below a non-interview assistant reply, and what to brand the resulting PDF with. */
function resolveExportConfig(mode: Mode, content: string): { label: string; modeLabel: string } | null {
  if (mode === "student" || mode === "general") {
    return { label: "Export PDF", modeLabel: MODES[mode].label };
  }
  if (mode === "career") {
    const kind = resolveCareerExportKind(content);
    if (kind === "resume") return { label: "Export Resume Report PDF", modeLabel: "Career Mode — Resume Guidance" };
    if (kind === "roadmap") return { label: "Export Career Roadmap PDF", modeLabel: "Career Mode — Career Roadmap" };
    return { label: "Export PDF", modeLabel: "Career Mode" };
  }
  return null;
}

function MessageBubbleImpl({
  message,
  mode,
  conversationId,
  questionContent,
  disableActions,
  onFeedback,
  onEdit,
  onDelete,
  onGenerateImage,
  imageGenerating,
}: {
  message: Message;
  mode: Mode;
  conversationId: string;
  /** The user's preceding question — used as the "Topic" line in the exported PDF. */
  questionContent?: string;
  /** True while a reply is streaming — editing/deleting history mid-stream is disallowed. */
  disableActions?: boolean;
  onFeedback: (conversationId: string, messageId: string, rating: FeedbackRating) => void;
  onEdit: (conversationId: string, messageId: string, content: string) => void;
  onDelete: (conversationId: string, messageId: string) => void;
  onGenerateImage: (conversationId: string, prompt: string) => void;
  /** True while any image generation is in flight — disables every Regenerate button so a second click can't fire a concurrent request. */
  imageGenerating?: boolean;
}) {
  const isUser = message.role === "user";
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [pdfState, setPdfState] = useState<PdfState>("idle");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [deleting, setDeleting] = useState(false);
  const [remembering, setRemembering] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [speaking, setSpeaking] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Guards against a rapid double Save/Enter submitting the same edit
  // twice — a plain `isEditing` re-render isn't enough, since two clicks
  // that land in the same tick both run before React processes the first
  // one's setIsEditing(false), which would otherwise fire two independent
  // edit+regenerate requests for the same message.
  const isCommittingEditRef = useRef(false);
  const modeConfig = MODES[mode];
  const Icon = modeConfig.icon;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !isEditing) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [draft, isEditing]);

  // Feature-detected after mount only, to avoid a client/server render
  // mismatch (`window` isn't available during Next.js's server render).
  useEffect(() => {
    setTtsSupported(isSpeechSynthesisSupported());
  }, []);

  // If this exact bubble is deleted (or the conversation is navigated away
  // from) while it's the one being read aloud, stop it rather than leaving
  // a dangling utterance playing for a message that's no longer on screen.
  const speakingRef = useRef(speaking);
  speakingRef.current = speaking;
  useEffect(() => {
    return () => {
      if (speakingRef.current) stopSpeaking();
    };
  }, []);

  // Only re-parsed when this message's own content changes (not on every
  // re-render) — during AI streaming, most bubbles in a conversation aren't
  // the one being updated, so this stays cached for them.
  const scoreData = useMemo(() => (isUser ? null : parseScoreCard(message.content)), [isUser, message.content]);
  // Searches for the full "#### <marker>" heading, not just the marker text
  // — indexOf(SCORE_MARKER) alone lands just past "#### ", leaving a stray
  // "####" at the end of the slice below.
  const preScoreContent = scoreData
    ? message.content.slice(0, message.content.indexOf(`#### ${SCORE_MARKER}`)).trim()
    : null;

  // A job-fit analysis (Career mode only) shows a structured match card
  // instead of raw markdown — see lib/career.ts's parseJobFitAnalysis.
  const jobFitData = useMemo(
    () => (isUser || mode !== "career" ? null : parseJobFitAnalysis(message.content)),
    [isUser, mode, message.content]
  );
  const preJobFitContent = jobFitData
    ? message.content.slice(0, message.content.indexOf(`#### ${JOB_FIT_HEADING}`)).trim()
    : null;

  // A generated image (always an assistant reply) shows as an image card;
  // any text the model returned alongside it is shown as a normal caption.
  // Computed before exportConfig below, which must never treat this
  // message's raw base64-bearing content as exportable markdown text.
  const generatedImage = useMemo(
    () => (isUser ? null : parseGeneratedImageMessage(message.content)),
    [isUser, message.content]
  );

  // A search-grounded reply (see lib/searchCitations.ts) has its cited
  // sources appended to `content` — stripped out here so they're never
  // treated as part of the reply's exportable/copyable/spoken text.
  const parsedCitations = useMemo(
    () => (isUser ? null : parseSearchCitationsMessage(message.content)),
    [isUser, message.content]
  );
  const cleanContent = parsedCitations?.content ?? message.content;

  const exportConfig =
    !isUser && !scoreData && !generatedImage && !jobFitData ? resolveExportConfig(mode, cleanContent) : null;

  // A document attachment shows a file chip instead of raw extracted text.
  // `message.documentMeta` is set directly for a message sent this session;
  // after a reload it's reconstructed by parsing the persisted
  // `[[document: ...]]` marker back out of `content` (see lib/document.ts).
  const parsedDocument = useMemo(
    () => (isUser && !message.documentMeta ? parseDocumentMessage(message.content) : null),
    [isUser, message.documentMeta, message.content]
  );
  const documentMeta = message.documentMeta ?? parsedDocument?.meta ?? null;
  const hasDocumentAttachment = Boolean(documentMeta);

  // Same idea as a document attachment, for a dataset (CSV) — see lib/dataset.ts.
  const parsedDataset = useMemo(
    () => (isUser && !message.datasetMeta ? parseDatasetMessage(message.content) : null),
    [isUser, message.datasetMeta, message.content]
  );
  const datasetMeta = message.datasetMeta ?? parsedDataset?.meta ?? null;
  const hasDatasetAttachment = Boolean(datasetMeta);

  const captionText = message.documentMeta
    ? message.content
    : message.datasetMeta
      ? message.content
      : parsedDocument
        ? parsedDocument.caption
        : parsedDataset
          ? parsedDataset.caption
          : generatedImage
            ? generatedImage.caption
            : cleanContent;

  function handleRegenerate() {
    if (!generatedImage || imageGenerating) return;
    onGenerateImage(conversationId, generatedImage.prompt);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(cleanContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently ignore in this mock UI
    }
  }

  /** Saves this exact message as a memory — a manual shortcut for the same "add a memory" action available in Settings. Never automatic. */
  async function handleRemember() {
    if (remembering === "saving" || !message.content.trim()) return;
    setRemembering("saving");
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.content.slice(0, 500) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Could not save that.");
      setRemembering("saved");
      setTimeout(() => setRemembering("idle"), 1500);
    } catch (err) {
      console.error("[memory] failed to save:", err);
      setRemembering("error");
      setTimeout(() => setRemembering("idle"), 3000);
    }
  }

  function handleToggleSpeech() {
    if (speaking) {
      stopSpeaking();
      return;
    }
    speak(stripMarkdownForSpeech(captionText || message.content), setSpeaking);
  }

  function startEdit() {
    isCommittingEditRef.current = false;
    setDraft(message.content);
    setIsEditing(true);
  }

  function cancelEdit() {
    setDraft(message.content);
    setIsEditing(false);
  }

  function commitEdit() {
    // Synchronous check-and-set — a second click/Enter landing in the same
    // tick as the first (before React re-renders) hits this before
    // setIsEditing(false) below has had any chance to take the Save button
    // out of the DOM.
    if (isCommittingEditRef.current) return;
    isCommittingEditRef.current = true;

    const trimmed = draft.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === message.content) {
      setDraft(message.content);
      isCommittingEditRef.current = false;
      return;
    }
    onEdit(conversationId, message.id, trimmed);
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  }

  function handleDelete() {
    const label = isUser ? "your message" : "this response";
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return;
    setDeleting(true);
    onDelete(conversationId, message.id);
  }

  async function handleExportPdf() {
    if (pdfState === "generating" || !exportConfig) return;
    setPdfState("generating");
    try {
      // Code-split: jsPDF and the markdown parser it needs are only fetched
      // when a user actually exports, instead of bloating the chat page's
      // initial bundle for every mode and every user.
      const { exportChatResponseAsPdf } = await import("@/lib/pdf/exportChatResponsePdf");
      await exportChatResponseAsPdf({
        modeLabel: exportConfig.modeLabel,
        question: questionContent ?? "",
        answer: cleanContent,
      });
      setPdfState("idle");
    } catch (err) {
      console.error("[pdf] export failed:", err);
      setPdfState("error");
      setTimeout(() => setPdfState("idle"), 3000);
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
            <InterviewResultsCard data={scoreData} conversationId={conversationId} />
          </div>
        ) : jobFitData ? (
          <div className="flex w-full flex-col gap-3">
            {preJobFitContent && (
              <div
                className="rounded-2xl rounded-tl-sm border-2 bg-surface-raised px-4 py-3 text-text"
                style={{ borderColor: modeConfig.colorSoft }}
              >
                <MessageContent content={preJobFitContent} />
              </div>
            )}
            <JobFitAnalysisCard data={jobFitData} />
          </div>
        ) : isEditing ? (
          <div className="flex w-full min-w-[280px] flex-col gap-2 rounded-2xl rounded-tr-sm border-2 border-brand bg-surface px-4 py-3">
            <textarea
              ref={textareaRef}
              autoFocus
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleEditKeyDown}
              aria-label="Edit your message"
              className="max-h-60 w-full resize-none bg-transparent text-[15px] text-text focus:outline-none"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={cancelEdit}
                className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted hover:bg-border-soft hover:text-text"
              >
                Cancel
              </button>
              <button
                onClick={commitEdit}
                disabled={!draft.trim()}
                className="rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Save & submit
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-col gap-2 rounded-2xl px-4 py-3",
              isUser
                ? "rounded-tr-sm bg-brand text-white"
                : "rounded-tl-sm border-2 bg-surface-raised text-text"
            )}
            style={!isUser ? { borderColor: modeConfig.colorSoft } : undefined}
          >
            {isUser && message.imageDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- ephemeral, client-only preview of an unpersisted attachment; not worth next/image here
              <img
                src={message.imageDataUrl}
                alt="Attached"
                className="max-h-64 w-full rounded-lg object-contain"
              />
            )}
            {documentMeta && (
              <DocumentAttachmentChip meta={documentMeta} extractedText={parsedDocument?.extractedText} onLight={isUser} />
            )}
            {datasetMeta && <DatasetAttachmentChip meta={datasetMeta} csvText={parsedDataset?.csvText} onLight={isUser} />}
            {captionText && <MessageContent content={captionText} />}
            {generatedImage && (
              <GeneratedImageCard image={generatedImage} onRegenerate={handleRegenerate} regenerating={Boolean(imageGenerating)} />
            )}
            {parsedCitations && <SearchSourcesCard sources={parsedCitations.sources} />}
          </div>
        )}
        {!isEditing && (
          <div className={cn("flex flex-wrap items-center gap-2.5 px-1 text-[13px] text-faint", isUser && "flex-row-reverse")}>
            <span>{formatTime(message.createdAt)}</span>
            {isUser && (
              <>
                <button
                  onClick={startEdit}
                  disabled={disableActions || Boolean(message.imageDataUrl) || hasDocumentAttachment || hasDatasetAttachment}
                  aria-label="Edit your message"
                  title={
                    message.imageDataUrl || hasDocumentAttachment || hasDatasetAttachment
                      ? "Editing isn't available for messages with an attached file"
                      : "Edit message"
                  }
                  className="flex items-center gap-1 opacity-0 transition-opacity hover:text-text group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Edit
                </button>
                {!user?.isGuest &&
                  !hasDocumentAttachment &&
                  !hasDatasetAttachment &&
                  !message.imageDataUrl &&
                  message.content.trim() && (
                  <button
                    onClick={handleRemember}
                    disabled={remembering === "saving"}
                    aria-label="Save this message as a memory"
                    title="Remember this — the assistant will see it in future conversations"
                    className={cn(
                      "flex items-center gap-1 transition-opacity hover:text-text disabled:pointer-events-none",
                      remembering === "idle" ? "opacity-0 group-hover:opacity-100" : "opacity-100",
                      remembering === "error" && "text-danger"
                    )}
                  >
                    {remembering === "saving" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {remembering === "saved" ? "Saved" : remembering === "error" ? "Failed" : "Remember"}
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={disableActions || deleting}
                  aria-label="Delete your message"
                  className="flex items-center gap-1 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </button>
              </>
            )}
            {!isUser && (
              <>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 opacity-0 transition-opacity hover:text-text group-hover:opacity-100"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                {ttsSupported && (
                  <button
                    onClick={handleToggleSpeech}
                    disabled={!message.content.trim()}
                    aria-label={speaking ? "Stop reading this response aloud" : "Read this response aloud"}
                    aria-pressed={speaking}
                    className={cn(
                      "flex items-center gap-1 transition-opacity hover:text-text disabled:pointer-events-none disabled:opacity-0",
                      speaking ? "text-brand opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    {speaking ? (
                      <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {speaking ? "Stop" : "Listen"}
                  </button>
                )}
                {exportConfig && (
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={pdfState === "generating" || !message.content.trim()}
                    aria-label={exportConfig.label}
                    aria-busy={pdfState === "generating"}
                    className={cn(
                      "flex items-center gap-1 transition-opacity hover:text-text disabled:cursor-not-allowed disabled:opacity-30",
                      pdfState === "idle" ? "opacity-0 group-hover:opacity-100 disabled:group-hover:opacity-30" : "opacity-100"
                    )}
                  >
                    {pdfState === "generating" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Download className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {pdfState === "generating" ? "Generating PDF..." : exportConfig.label}
                  </button>
                )}
                {pdfState === "error" && (
                  <span role="status" className="text-danger">
                    Unable to generate PDF. Please try again.
                  </span>
                )}
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
                <button
                  onClick={handleDelete}
                  disabled={disableActions || deleting}
                  aria-label="Delete this response"
                  className="flex items-center gap-1 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// During AI streaming, only the one bubble whose content is growing should
// re-render — memoized so the rest of the conversation's bubbles bail out
// instead of re-rendering (and re-running parseScoreCard) on every chunk.
export const MessageBubble = memo(MessageBubbleImpl);
