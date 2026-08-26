import type { ModeConfig } from "@/lib/modes";

export function SuggestedPrompts({
  mode,
  onSelect,
}: {
  mode: ModeConfig;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {mode.quickActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.label}
            onClick={() => onSelect(action.prompt)}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-current hover:bg-brand-soft"
            style={{ color: mode.color }}
          >
            <span
              className="flex h-9 w-9 flex-none items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: mode.color }}
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-text">{action.label}</span>
              <span className="block text-[13px] text-muted">{action.subtitle}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
