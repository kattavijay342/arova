"use client";

import { AlertTriangle, RefreshCcw, X } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";

export function ChatErrorState({ message }: { message: string }) {
  const { retryLastMessage, dismissError, status } = useChat();

  return (
    <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger">Couldn&apos;t get a response</p>
        <p className="mt-0.5 text-sm text-danger/90">{message}</p>
        <div className="mt-2.5 flex items-center gap-3">
          <button
            onClick={() => retryLastMessage()}
            disabled={status === "loading"}
            className="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCcw className="h-3 w-3" aria-hidden />
            Retry
          </button>
          <button
            onClick={dismissError}
            className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
          >
            <X className="h-3 w-3" aria-hidden />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
