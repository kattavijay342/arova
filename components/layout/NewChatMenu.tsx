"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { MODE_LIST } from "@/lib/modes";
import type { Mode } from "@/lib/types";
import { useChat } from "@/lib/context/ChatContext";
import { cn } from "@/lib/utils";

/**
 * "New chat" opens a small inline mode picker instead of navigating to a
 * full page — picking a mode creates the conversation and goes straight
 * there, so starting a new chat is one click + one pick, not two screens.
 */
export function NewChatMenu({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { createConversation } = useChat();

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function pick(modeId: Mode) {
    setOpen(false);
    onNavigate?.();
    const id = await createConversation(modeId);
    router.push(`/chat/${id}`);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="New chat"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-3 text-[15px] font-semibold text-white shadow-soft transition-all",
          "hover:scale-[1.02] hover:opacity-95 hover:shadow-lg active:scale-[0.98]",
          collapsed && "md:mx-auto md:h-11 md:w-11 md:rounded-full md:p-0"
        )}
      >
        <Plus className="h-[18px] w-[18px] flex-none" aria-hidden />
        <span className={cn(collapsed && "md:hidden")}>New Chat</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-30 mt-2 w-60 animate-fade-in rounded-xl border border-border bg-surface-raised p-1.5 shadow-soft",
            collapsed ? "left-full top-0 ml-2" : "left-0"
          )}
        >
          <p className="px-2.5 pb-1.5 pt-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-faint">
            Choose a mode
          </p>
          {MODE_LIST.map((mode) => {
            const Icon = mode.icon;
            return (
              <button
                key={mode.id}
                role="menuitem"
                onClick={() => pick(mode.id)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-border-soft"
              >
                <span
                  className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-white"
                  style={{ backgroundColor: mode.color }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-text">{mode.shortLabel}</span>
                  <span className="block truncate text-xs text-faint">{mode.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
