"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  /** Renders a submenu flyout instead of acting as a clickable action. */
  submenu?: MenuItem[];
  /** Shown when a submenu has nothing to offer yet (e.g. no projects exist). */
  emptyLabel?: string;
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  /** Accessible name for the icon-only trigger button — required since `trigger` is typically a bare icon with no visible text. */
  ariaLabel?: string;
}

export function Menu({ trigger, items, align = "right", ariaLabel }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setOpenSubmenu(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setOpenSubmenu(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex items-center justify-center rounded-md p-1 text-faint hover:bg-border-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-20 mt-1 w-44 animate-fade-in overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-soft",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) =>
            item.submenu ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setOpenSubmenu(item.label)}
                onMouseLeave={() => setOpenSubmenu((cur) => (cur === item.label ? null : cur))}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={openSubmenu === item.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenSubmenu(item.label);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text hover:bg-border-soft"
                >
                  {item.icon}
                  {item.label}
                  <span className="ml-auto text-faint">›</span>
                </button>
                {openSubmenu === item.label && (
                  <div
                    role="menu"
                    // Always opens to the right of the parent menu (regardless of
                    // `align`) — a narrow sidebar leaves no room for a submenu to
                    // extend further left without being clipped off-screen.
                    className="absolute left-full top-0 z-30 ml-1 w-48 animate-fade-in overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-soft"
                  >
                    {item.submenu.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-faint">{item.emptyLabel ?? "Nothing here yet"}</p>
                    ) : (
                      item.submenu.map((sub) => (
                        <button
                          key={sub.label}
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                            setOpenSubmenu(null);
                            sub.onClick?.();
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-border-soft",
                            sub.danger ? "text-danger" : "text-text"
                          )}
                        >
                          {sub.icon}
                          {sub.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onClick?.();
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-border-soft",
                  item.danger ? "text-danger" : "text-text"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
