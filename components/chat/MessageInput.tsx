"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Mic, Send, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { MODES } from "@/lib/modes";
import type { Mode } from "@/lib/types";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  mode: Mode;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({ value, onChange, onSend, mode, disabled, placeholder }: MessageInputProps) {
  const modeConfig = MODES[mode];
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleSend() {
    if (disabled) return;
    const withAttachment = attachedFile
      ? `${value.trim()}${value.trim() ? "\n\n" : ""}📎 Attached: ${attachedFile.name}`
      : value;
    if (!withAttachment.trim()) return;
    setAttachedFile(null);
    onSend(withAttachment);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setAttachedFile(file);
    e.target.value = "";
  }

  const canSend = !disabled && (value.trim().length > 0 || attachedFile !== null);

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
        {attachedFile && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 text-[13px] text-text">
            <FileText className="h-3.5 w-3.5 flex-none text-brand" aria-hidden />
            <span className="max-w-[220px] truncate">{attachedFile.name}</span>
            <button
              onClick={() => setAttachedFile(null)}
              aria-label="Remove attachment"
              className="text-faint hover:text-text"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-bg px-2 py-2 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title="Attach a file"
            aria-label="Attach a file"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-faint hover:bg-border-soft hover:text-text disabled:opacity-50"
          >
            <Paperclip className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder ?? "Type your message…"}
            aria-label="Message"
            className="max-h-40 flex-1 resize-none bg-transparent px-1 py-1.5 text-[16px] text-text placeholder:text-faint focus:outline-none disabled:opacity-60"
          />
          <button
            disabled
            title="Voice input — coming soon"
            aria-label="Voice input — coming soon"
            className="flex h-9 w-9 flex-none cursor-not-allowed items-center justify-center rounded-xl text-faint opacity-50"
          >
            <Mic className="h-[18px] w-[18px]" aria-hidden />
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "flex h-9 w-9 flex-none items-center justify-center rounded-xl transition-colors",
              canSend ? "bg-brand text-white hover:opacity-90" : "bg-border-soft text-faint"
            )}
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-4xl text-center text-[13px] text-faint">
        AI can make mistakes. Please verify important information.
      </p>
    </div>
  );
}
