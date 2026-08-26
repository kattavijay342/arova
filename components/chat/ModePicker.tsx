"use client";

import { useRouter } from "next/navigation";
import { MODE_LIST, MODE_GLOW_CLASS } from "@/lib/modes";
import { cn } from "@/lib/utils";
import { useChat } from "@/lib/context/ChatContext";

export function ModePicker() {
  const router = useRouter();
  const { createConversation } = useChat();

  async function handlePick(modeId: (typeof MODE_LIST)[number]["id"]) {
    const id = await createConversation(modeId);
    router.push(`/chat/${id}`);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <h1 className="font-display text-3xl font-semibold text-text sm:text-4xl">Start a new chat</h1>
      <p className="mt-2.5 text-[15px] text-muted">Choose how you want to use AI today.</p>
      <div className="mt-10 grid w-full grid-cols-1 gap-5 sm:grid-cols-3">
        {MODE_LIST.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              onClick={() => handlePick(mode.id)}
              className={cn(
                "group flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-9 text-center transition-all hover:-translate-y-1 hover:border-transparent",
                MODE_GLOW_CLASS[mode.id]
              )}
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-soft transition-transform group-hover:scale-105"
                style={{ backgroundColor: mode.color }}
              >
                <Icon className="h-7 w-7" aria-hidden />
              </span>
              <span className="font-display text-xl font-semibold text-text">{mode.shortLabel}</span>
              <span
                className="font-mono text-xs font-semibold uppercase tracking-wide"
                style={{ color: mode.color }}
              >
                {mode.quickTags}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
