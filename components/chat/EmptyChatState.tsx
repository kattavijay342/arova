import { MODES } from "@/lib/modes";
import type { Mode } from "@/lib/types";
import { SuggestedPrompts } from "./SuggestedPrompts";

export function EmptyChatState({ mode, onSelectPrompt }: { mode: Mode; onSelectPrompt: (prompt: string) => void }) {
  const config = MODES[mode];
  const Icon = config.icon;

  return (
    <div className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-soft"
        style={{ backgroundColor: config.color }}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p
        className="mb-1.5 font-mono text-xs font-semibold uppercase tracking-wide"
        style={{ color: config.color }}
      >
        {config.label}
      </p>
      <h2 className="text-balance font-display text-2xl font-semibold text-text">{config.starterQuestion}</h2>
      <p className="mt-2 text-[15px] text-muted">{config.greeting}</p>
      <div className="mt-7 w-full">
        <SuggestedPrompts mode={config} onSelect={onSelectPrompt} />
      </div>
    </div>
  );
}
