"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MODE_GLOW_CLASS, type ModeConfig } from "@/lib/modes";
import { useChat } from "@/lib/context/ChatContext";
import { cn } from "@/lib/utils";

export function ModeCard({ mode }: { mode: ModeConfig }) {
  const router = useRouter();
  const { createConversation } = useChat();
  const Icon = mode.icon;

  async function handleStart() {
    const id = await createConversation(mode.id);
    router.push(`/chat/${id}`);
  }

  return (
    <button
      onClick={handleStart}
      className={cn(
        "group relative flex w-full flex-col items-start gap-4 overflow-hidden rounded-2xl border bg-surface p-6 text-left shadow-soft transition-all",
        "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:shadow-soft",
        MODE_GLOW_CLASS[mode.id],
        mode.featured ? "border-2" : "border-border"
      )}
      style={mode.featured ? { borderColor: mode.colorSoft } : undefined}
    >
      {mode.featured && (
        <span
          className="absolute right-4 top-4 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-white"
          style={{ backgroundColor: mode.color }}
        >
          Most Popular
        </span>
      )}
      <span
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-70 transition-transform duration-300 group-hover:scale-110"
        style={{ backgroundColor: mode.colorSoft }}
        aria-hidden
      />
      <span
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-soft"
        style={{ backgroundColor: mode.color }}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <div className="relative">
        <p className="font-mono text-xs font-semibold uppercase tracking-wider" style={{ color: mode.color }}>
          {mode.shortLabel} Mode
        </p>
        <h3 className="mt-1.5 text-balance font-display text-xl font-semibold text-text">{mode.valueProp}</h3>
        <p className="mt-1.5 text-[15px] text-muted">{mode.description}</p>
      </div>
      <span
        className="relative mt-1 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition-transform group-active:scale-95"
        style={{ backgroundColor: mode.color }}
      >
        {mode.ctaLabel}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </button>
  );
}
