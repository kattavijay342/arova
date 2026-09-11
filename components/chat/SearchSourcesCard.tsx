"use client";

import { Globe } from "lucide-react";
import type { WebSource } from "@/lib/searchCitations";

/** The list of pages Gemini's Google Search grounding cited for a reply, shown as a row of clickable source pills below the message text. */
export function SearchSourcesCard({ sources }: { sources: WebSource[] }) {
  if (sources.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border-soft pt-2">
      <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-faint">
        <Globe className="h-3 w-3" aria-hidden />
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <a
            key={source.uri}
            href={source.uri}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="max-w-[220px] truncate rounded-full border border-border bg-bg px-2.5 py-1 text-[12px] text-muted hover:border-brand hover:text-brand"
          >
            {source.title}
          </a>
        ))}
      </div>
    </div>
  );
}
