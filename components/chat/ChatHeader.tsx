import type { Conversation } from "@/lib/types";
import { ModeBadge } from "@/components/ui/Badge";

export function ChatHeader({ conversation }: { conversation: Conversation }) {
  return (
    <div className="flex items-center gap-3 border-b border-border-soft bg-surface px-5 py-3.5 sm:px-8">
      <ModeBadge mode={conversation.mode} />
      <h1 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-text">
        {conversation.title}
      </h1>
    </div>
  );
}
