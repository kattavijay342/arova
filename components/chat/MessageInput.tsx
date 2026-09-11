"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Mic, Square, Send, X, FileText, ImagePlus, Globe, Telescope, Table2, Target, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODES } from "@/lib/modes";
import { ALLOWED_DOCUMENT_MIME_TYPES, MAX_DOCUMENT_BYTES, documentTypeLabel } from "@/lib/document";
import { ALLOWED_DATASET_MIME_TYPES, ALLOWED_DATASET_EXTENSIONS, MAX_DATASET_BYTES } from "@/lib/dataset";
import { getSpeechRecognitionConstructor, isSpeechRecognitionSupported, speechRecognitionErrorMessage } from "@/lib/speech";
import { looksLikeImageGenerationRequest } from "@/lib/imageIntent";
import type { MessageAttachment, Mode } from "@/lib/types";

// Kept in sync with the server-side allow-list in
// app/api/conversations/[id]/messages/route.ts.
const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_DOCUMENT_MB = Math.round(MAX_DOCUMENT_BYTES / (1024 * 1024));
const MAX_DATASET_MB = Math.round(MAX_DATASET_BYTES / (1024 * 1024));

const FILE_PICKER_ACCEPT = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  ...ALLOWED_DOCUMENT_MIME_TYPES,
  ...ALLOWED_DATASET_MIME_TYPES,
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  ...ALLOWED_DATASET_EXTENSIONS,
].join(",");

interface AttachedFile {
  kind: "image" | "document" | "dataset";
  file: File;
  dataUrl: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Shared by every icon-only button in the composer so keyboard focus is
// always visible (mirrors components/ui/Button.tsx's own focus-visible
// treatment, rather than inventing a second convention for this component).
const TOOL_BUTTON_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (
    text: string,
    attachment?: MessageAttachment | null,
    webSearch?: boolean,
    deepResearch?: boolean,
    jobFitAnalysis?: boolean,
    /** True when voice input contributed to this message — lets the caller decide to auto-speak the reply once it arrives (see the chat page). */
    wasVoiceComposed?: boolean
  ) => void;
  onGenerateImage: (prompt: string) => void;
  mode: Mode;
  disabled?: boolean;
  /** True for the whole duration of a streaming reply — swaps the Send button for a Stop button. */
  isStreaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onGenerateImage,
  mode,
  disabled,
  isStreaming,
  onStop,
  placeholder,
}: MessageInputProps) {
  const modeConfig = MODES[mode];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<AttachedFile | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [imageMode, setImageMode] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [jobFitAnalysis, setJobFitAnalysis] = useState(false);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseValueRef = useRef("");
  // True once voice input has actually transcribed something into the
  // current draft — reset on send (see handleSend) — so the caller can
  // auto-speak the reply once it arrives. Deliberately not set just from
  // clicking the mic: a click that captured no speech shouldn't count.
  const wasVoiceComposedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Feature-detected after mount only — `window` isn't available during
  // Next.js's server render, so checking this during render would produce a
  // client/server markup mismatch.
  useEffect(() => {
    setSpeechSupported(isSpeechRecognitionSupported());
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function handleMicClick() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceError("Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }

    setVoiceError(null);
    setAttachError(null);
    baseValueRef.current = value;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = typeof navigator !== "undefined" ? navigator.language : "en-US";

    let finalTranscript = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      const base = baseValueRef.current;
      const spoken = (finalTranscript + interim).trim();
      if (spoken) wasVoiceComposedRef.current = true;
      onChangeRef.current(spoken ? `${base}${base ? " " : ""}${spoken}` : base);
    };
    recognition.onerror = (event) => {
      // "aborted" fires when the user clicks the mic again to stop — not a
      // real failure, so it shouldn't surface an error message.
      if (event.error !== "aborted") {
        setVoiceError(speechRecognitionErrorMessage(event.error));
      }
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleSend() {
    if (disabled) return;
    recognitionRef.current?.stop();

    // A plain message phrased as an image request ("Generate an image of
    // ...") is routed the same way as the manual image-mode toggle, so
    // typing it directly works without first clicking the ImagePlus button
    // (see lib/imageIntent.ts). Only applies with no attachment/other tool
    // active — those are explicit choices that take priority.
    const isImplicitImageRequest =
      !imageMode && !attachedFile && !webSearch && !deepResearch && !jobFitAnalysis && looksLikeImageGenerationRequest(value);

    if (imageMode || isImplicitImageRequest) {
      if (!value.trim()) return;
      const prompt = value;
      onChange("");
      onGenerateImage(prompt);
      return;
    }

    if (!value.trim() && !attachedFile) return;

    const attachment: MessageAttachment | null = attachedFile
      ? attachedFile.kind === "image"
        ? { kind: "image", mimeType: attachedFile.file.type, data: attachedFile.dataUrl.split(",")[1] ?? "" }
        : attachedFile.kind === "dataset"
          ? {
              kind: "dataset",
              mimeType: "text/csv",
              data: attachedFile.dataUrl.split(",")[1] ?? "",
              filename: attachedFile.file.name,
            }
          : {
              kind: "document",
              mimeType: attachedFile.file.type,
              data: attachedFile.dataUrl.split(",")[1] ?? "",
              filename: attachedFile.file.name,
            }
      : null;

    const text = value;
    const wasVoiceComposed = wasVoiceComposedRef.current;
    wasVoiceComposedRef.current = false;
    setAttachedFile(null);
    setAttachError(null);
    onSend(text, attachment, webSearch, deepResearch, jobFitAnalysis, wasVoiceComposed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.type);
    const isDocument = (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type);
    // CSV's browser-reported MIME type is unreliable (empty string, or
    // application/vnd.ms-excel on some Windows setups) — the extension is
    // the dependable signal, same reasoning as the .doc check below.
    const isDataset =
      (ALLOWED_DATASET_MIME_TYPES as readonly string[]).includes(file.type) || file.name.toLowerCase().endsWith(".csv");

    if (!isImage && !isDocument && !isDataset) {
      // A legacy .doc (application/msword) file trips this — mammoth can
      // only read the modern .docx (OOXML) format, and there's no reliable
      // pure-JS parser for the old binary format, so it's called out
      // specifically instead of just "unsupported file type".
      if (file.name.toLowerCase().endsWith(".doc")) {
        setAttachError("Legacy .doc files aren't supported — please save it as .docx or PDF and try again.");
        return;
      }
      setAttachError("Supported files: PNG, JPEG, WEBP, HEIC, HEIF images, PDF/DOCX/TXT/MD documents, or CSV datasets.");
      return;
    }
    if (isImage && file.size > MAX_IMAGE_BYTES) {
      setAttachError("Image is too large — the limit is 4MB.");
      return;
    }
    if (isDocument && file.size > MAX_DOCUMENT_BYTES) {
      setAttachError(`File is too large — the limit is ${MAX_DOCUMENT_MB}MB.`);
      return;
    }
    if (isDataset && file.size > MAX_DATASET_BYTES) {
      setAttachError(`File is too large — the limit is ${MAX_DATASET_MB}MB.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachError(null);
      setAttachedFile({
        kind: isImage ? "image" : isDataset ? "dataset" : "document",
        file,
        dataUrl: reader.result as string,
      });
    };
    reader.onerror = () => setAttachError("Could not read the selected file.");
    reader.readAsDataURL(file);
  }

  const canSend = !disabled && (imageMode ? value.trim().length > 0 : value.trim().length > 0 || attachedFile !== null);

  return (
    <div className="border-t border-border-soft bg-surface px-5 py-4 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-1.5 flex items-center gap-1.5 px-1">
          <span
            className="h-[7px] w-[7px] flex-none rounded-full"
            style={{ backgroundColor: modeConfig.color }}
            aria-hidden
          />
          <span
            className="font-mono text-[12px] font-semibold uppercase tracking-wide"
            style={{ color: modeConfig.color }}
          >
            {modeConfig.assistantLabel}
          </span>
        </div>
        {attachedFile && attachedFile.kind === "image" && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[13px] text-text">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived local preview of a just-picked file, not worth next/image here */}
            <img
              src={attachedFile.dataUrl}
              alt=""
              className="h-6 w-6 flex-none rounded object-cover"
            />
            <span className="max-w-[220px] truncate">{attachedFile.file.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              aria-label="Remove attachment"
              className="text-faint hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        {attachedFile && attachedFile.kind === "document" && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[13px] text-text">
            <FileText className="h-4 w-4 flex-none text-faint" aria-hidden />
            <span className="max-w-[220px] truncate">{attachedFile.file.name}</span>
            <span className="flex-none font-mono text-[11px] uppercase text-faint">
              {documentTypeLabel(attachedFile.file.type)} · {formatFileSize(attachedFile.file.size)}
            </span>
            <button
              onClick={() => setAttachedFile(null)}
              aria-label="Remove attachment"
              className="text-faint hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        {attachedFile && attachedFile.kind === "dataset" && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[13px] text-text">
            <Table2 className="h-4 w-4 flex-none text-faint" aria-hidden />
            <span className="max-w-[220px] truncate">{attachedFile.file.name}</span>
            <span className="flex-none font-mono text-[11px] uppercase text-faint">
              Dataset · {formatFileSize(attachedFile.file.size)}
            </span>
            <button
              onClick={() => setAttachedFile(null)}
              aria-label="Remove attachment"
              className="text-faint hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        {imageMode && !attachedFile && (
          <p className="mb-2 flex animate-fade-in items-center gap-1.5 text-[13px] text-brand">
            <ImagePlus className="h-3.5 w-3.5 flex-none" aria-hidden />
            Image generation mode — describe what you&apos;d like to create.
          </p>
        )}
        {webSearch && !imageMode && (
          <p className="mb-2 flex animate-fade-in items-center gap-1.5 text-[13px] text-brand">
            <Globe className="h-3.5 w-3.5 flex-none" aria-hidden />
            Web search is on — replies will be grounded in live Google Search results.
          </p>
        )}
        {deepResearch && (
          <p className="mb-2 flex animate-fade-in items-center gap-1.5 text-[13px] text-brand">
            <Telescope className="h-3.5 w-3.5 flex-none" aria-hidden />
            Deep research is on — expect a longer, more thorough, well-cited report and a slower reply.
          </p>
        )}
        {jobFitAnalysis && (
          <p className="mb-2 flex animate-fade-in items-center gap-1.5 text-[13px] text-brand">
            <Target className="h-3.5 w-3.5 flex-none" aria-hidden />
            Job fit analysis is on — paste the job description, and attach your resume for a more accurate match.
          </p>
        )}
        {attachError && <p className="mb-2 animate-fade-in text-[13px] text-danger">{attachError}</p>}
        {voiceError && (
          <p role="alert" className="mb-2 animate-fade-in text-[13px] text-danger">
            {voiceError}
          </p>
        )}
        {listening && (
          <p role="status" className="mb-2 flex animate-fade-in items-center gap-1.5 text-[13px] text-danger">
            <span className="h-2 w-2 flex-none animate-pulse rounded-full bg-danger" aria-hidden />
            Listening… click the mic again to stop.
          </p>
        )}
        <div
          className={cn(
            "flex flex-wrap items-end gap-1.5 rounded-2xl border border-border-soft bg-bg px-2.5 py-2",
            "transition-all duration-200 hover:border-border",
            "focus-within:border-brand/50 focus-within:ring-[3px] focus-within:ring-brand/15 focus-within:hover:border-brand/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={FILE_PICKER_ACCEPT}
            onChange={handleFileChange}
          />
          {/* Secondary tools — attach + mode toggles. Grouped so they wrap as
              one unit onto their own line on narrow screens, instead of the
              message field being squeezed by them (see the primary group below). */}
          <div className="flex flex-none items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || imageMode || webSearch || deepResearch}
              title="Attach an image or document (PDF, DOCX, TXT, MD)"
              aria-label="Attach an image or document"
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-xl text-faint transition-colors duration-150 hover:bg-border-soft hover:text-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-faint",
                TOOL_BUTTON_FOCUS
              )}
            >
              <Paperclip className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              onClick={() => setImageMode((v) => !v)}
              disabled={disabled || Boolean(attachedFile) || webSearch || deepResearch || jobFitAnalysis}
              title={imageMode ? "Switch back to normal chat" : "Generate an image"}
              aria-label={imageMode ? "Turn off image generation mode" : "Turn on image generation mode"}
              aria-pressed={imageMode}
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors duration-150",
                imageMode ? "bg-brand/10 text-brand" : "text-faint hover:bg-border-soft hover:text-text",
                (disabled || Boolean(attachedFile) || webSearch || deepResearch || jobFitAnalysis) &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-faint",
                TOOL_BUTTON_FOCUS
              )}
            >
              <ImagePlus className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              onClick={() => setWebSearch((v) => !v)}
              disabled={disabled || Boolean(attachedFile) || imageMode || deepResearch || jobFitAnalysis}
              title={webSearch ? "Turn off web search" : "Search the web for this message"}
              aria-label={webSearch ? "Turn off web search" : "Turn on web search"}
              aria-pressed={webSearch}
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors duration-150",
                webSearch ? "bg-brand/10 text-brand" : "text-faint hover:bg-border-soft hover:text-text",
                (disabled || Boolean(attachedFile) || imageMode || deepResearch || jobFitAnalysis) &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-faint",
                TOOL_BUTTON_FOCUS
              )}
            >
              <Globe className="h-[18px] w-[18px]" aria-hidden />
            </button>
            <button
              onClick={() => setDeepResearch((v) => !v)}
              disabled={disabled || Boolean(attachedFile) || imageMode || webSearch || jobFitAnalysis}
              title={deepResearch ? "Turn off deep research" : "Deep research this topic"}
              aria-label={deepResearch ? "Turn off deep research" : "Turn on deep research"}
              aria-pressed={deepResearch}
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors duration-150",
                deepResearch ? "bg-brand/10 text-brand" : "text-faint hover:bg-border-soft hover:text-text",
                (disabled || Boolean(attachedFile) || imageMode || webSearch || jobFitAnalysis) &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-faint",
                TOOL_BUTTON_FOCUS
              )}
            >
              <Telescope className="h-[18px] w-[18px]" aria-hidden />
            </button>
            {mode === "career" && (
              <button
                onClick={() => setJobFitAnalysis((v) => !v)}
                disabled={disabled || imageMode || webSearch || deepResearch}
                title={jobFitAnalysis ? "Turn off job fit analysis" : "Analyze fit against a job description"}
                aria-label={jobFitAnalysis ? "Turn off job fit analysis" : "Turn on job fit analysis"}
                aria-pressed={jobFitAnalysis}
                className={cn(
                  "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors duration-150",
                  jobFitAnalysis ? "bg-brand/10 text-brand" : "text-faint hover:bg-border-soft hover:text-text",
                  (disabled || imageMode || webSearch || deepResearch) &&
                    "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-faint",
                  TOOL_BUTTON_FOCUS
                )}
              >
                <Target className="h-[18px] w-[18px]" aria-hidden />
              </button>
            )}
          </div>
          {/* Primary group — message field, voice, send. Wraps onto its own
              full-width line as a unit (never split) when the tools above
              don't leave enough room, so these three stay reachable and
              touch-friendly at any viewport width without ever overflowing. */}
          <div className="flex min-w-[240px] flex-1 items-end gap-1">
            <textarea
              ref={textareaRef}
              rows={1}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={imageMode ? "Describe the image you want to generate…" : (placeholder ?? "Type your message…")}
              aria-label={imageMode ? "Image generation prompt" : "Message"}
              className="max-h-40 flex-1 resize-none bg-transparent px-1 py-1.5 text-[16px] text-text placeholder:text-faint focus:outline-none disabled:opacity-60"
            />
            <button
              onClick={handleMicClick}
              disabled={disabled || !speechSupported}
              title={
                !speechSupported
                  ? "Voice input isn't supported in this browser"
                  : listening
                    ? "Stop recording"
                    : "Voice input"
              }
              aria-label={listening ? "Stop voice input recording" : "Start voice input"}
              aria-pressed={listening}
              className={cn(
                "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors duration-150",
                listening ? "bg-danger/10 text-danger" : "text-faint hover:bg-border-soft hover:text-text",
                (disabled || !speechSupported) && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-faint",
                TOOL_BUTTON_FOCUS
              )}
            >
              {listening ? (
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
              ) : (
                <Mic className="h-[18px] w-[18px]" aria-hidden />
              )}
            </button>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className={cn(
                  "flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand text-white transition-all duration-150 hover:opacity-90 active:scale-95",
                  TOOL_BUTTON_FOCUS
                )}
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!canSend}
                aria-label={disabled ? "Sending…" : imageMode ? "Generate image" : "Send message"}
                aria-busy={disabled}
                className={cn(
                  "flex h-9 w-9 flex-none items-center justify-center rounded-full transition-all duration-150",
                  canSend
                    ? "bg-brand text-white hover:scale-105 hover:opacity-90 active:scale-95"
                    : "bg-border-soft text-faint",
                  TOOL_BUTTON_FOCUS
                )}
              >
                {disabled ? (
                  <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
                ) : (
                  <Send className="h-[18px] w-[18px]" aria-hidden />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-4xl text-center text-[13px] text-faint">
        AI can make mistakes. Please verify important information.
      </p>
    </div>
  );
}
