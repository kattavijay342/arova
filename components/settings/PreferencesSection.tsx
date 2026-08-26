"use client";

import { Monitor, Trash2 } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PreferencesSection() {
  const { conversations, clearAllConversations } = useChat();

  function handleClear() {
    if (conversations.length === 0) return;
    if (window.confirm(`Delete all ${conversations.length} conversation(s)? This can't be undone.`)) {
      clearAllConversations();
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold text-text">Preferences</h2>

      <div className="mt-5 flex items-center justify-between gap-4 border-b border-border-soft pb-5">
        <div className="flex items-start gap-3">
          <Monitor className="mt-0.5 h-4 w-4 flex-none text-faint" aria-hidden />
          <div>
            <p className="text-[15px] font-semibold text-text">Appearance</p>
            <p className="text-[15px] text-muted">Follows your system's light or dark setting automatically.</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Trash2 className="mt-0.5 h-4 w-4 flex-none text-faint" aria-hidden />
          <div>
            <p className="text-[15px] font-semibold text-text">Clear chat history</p>
            <p className="text-[15px] text-muted">Permanently delete all conversations across every mode.</p>
          </div>
        </div>
        <Button variant="danger" size="sm" onClick={handleClear} disabled={conversations.length === 0}>
          Clear all
        </Button>
      </div>
    </Card>
  );
}
