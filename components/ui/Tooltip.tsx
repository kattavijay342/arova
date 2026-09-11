import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight hover/focus tooltip for icon-only controls — built for the
 * collapsed sidebar rail, where a bare icon needs a visible label. Pure CSS
 * (group-hover/group-focus-within), so it works for both mouse and keyboard
 * navigation with no extra JS, and inherits the app-wide
 * prefers-reduced-motion override in globals.css automatically.
 */
export function Tooltip({
  label,
  children,
  side = "right",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "right" | "top";
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-[12px] font-medium text-text opacity-0 shadow-soft transition-all duration-150",
          "scale-95 group-hover/tooltip:scale-100 group-hover/tooltip:opacity-100 group-focus-within/tooltip:scale-100 group-focus-within/tooltip:opacity-100",
          side === "right" ? "left-full top-1/2 ml-2 -translate-y-1/2" : "bottom-full left-1/2 mb-2 -translate-x-1/2"
        )}
      >
        {label}
      </span>
    </span>
  );
}
