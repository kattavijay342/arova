import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Mode } from "@/lib/types";
import { MODES } from "@/lib/modes";

export function ModeBadge({ mode, size = "md" }: { mode: Mode; size?: "sm" | "md" }) {
  const config = MODES[mode];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-mono font-medium",
        config.bgSoftClass,
        config.textClass,
        size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-1"
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {config.shortLabel}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-soft bg-border-soft px-2.5 py-0.5 text-xs font-mono text-muted",
        className
      )}
    >
      {children}
    </span>
  );
}
