import type { Mode } from "@/lib/types";
import { MODES } from "@/lib/modes";

export function TypingIndicator({ mode }: { mode: Mode }) {
  const modeConfig = MODES[mode];
  const Icon = modeConfig.icon;

  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full text-white shadow-soft"
        style={{ backgroundColor: modeConfig.color }}
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-1">
        <span
          className="px-1 font-mono text-[13px] font-semibold uppercase tracking-wide"
          style={{ color: modeConfig.color }}
        >
          {modeConfig.assistantLabel}
        </span>
        <div
          className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border-2 bg-surface-raised px-4 py-3.5"
          style={{ borderColor: modeConfig.colorSoft }}
          role="status"
          aria-label={`${modeConfig.shortLabel} assistant is typing`}
        >
          <span className="h-2 w-2 animate-bounce-dot rounded-full bg-faint [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce-dot rounded-full bg-faint [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce-dot rounded-full bg-faint" />
        </div>
      </div>
    </div>
  );
}
