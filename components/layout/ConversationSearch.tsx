"use client";

import { forwardRef } from "react";
import { Search, X } from "lucide-react";

export const ConversationSearch = forwardRef<HTMLInputElement, { value: string; onChange: (value: string) => void }>(
  function ConversationSearch({ value, onChange }, ref) {
    return (
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" aria-hidden />
        <input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onChange("");
          }}
          placeholder="Search conversations…"
          aria-label="Search conversations"
          className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-7 text-[13px] text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {value && (
          <button
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:bg-border-soft hover:text-text"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
    );
  }
);
