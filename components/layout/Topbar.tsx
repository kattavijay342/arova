"use client";

import { Menu as MenuIcon } from "lucide-react";

export function Topbar({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-soft bg-surface px-4 py-3 md:hidden">
      <button
        onClick={onOpenSidebar}
        className="rounded-md p-1.5 text-muted hover:bg-border-soft hover:text-text"
        aria-label="Open sidebar"
      >
        <MenuIcon className="h-5 w-5" aria-hidden />
      </button>
      <span className="font-display text-base font-semibold text-text">Arova</span>
    </div>
  );
}
