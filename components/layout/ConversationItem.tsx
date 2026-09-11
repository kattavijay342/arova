"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { MODES } from "@/lib/modes";
import { cn, formatRelativeDay } from "@/lib/utils";
import { Menu } from "@/components/ui/Menu";

function ConversationItemImpl({
  conversation,
  active,
  onDelete,
  onRename,
}: {
  conversation: Conversation;
  active: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title);
  const mode = MODES[conversation.mode];

  function commitRename() {
    setEditing(false);
    if (draftTitle.trim() && draftTitle.trim() !== conversation.title) {
      onRename(conversation.id, draftTitle.trim());
    } else {
      setDraftTitle(conversation.title);
    }
  }

  function handleDelete() {
    if (window.confirm(`Delete "${conversation.title}"? This can't be undone.`)) {
      onDelete(conversation.id);
      if (active) router.push("/chat");
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") {
            setDraftTitle(conversation.title);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-brand bg-surface px-2.5 py-1.5 text-[15px] text-text focus:outline-none"
      />
    );
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-1 rounded-lg border-l-[3px] border-l-transparent pr-1 transition-colors",
        active
          ? "border-l-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-brand-soft)]"
          : "hover:border-l-border hover:bg-border-soft"
      )}
    >
      <button
        onClick={() => router.push(`/chat/${conversation.id}`)}
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
        title={conversation.title}
      >
        <span
          className="mt-[7px] h-[7px] w-[7px] flex-none rounded-full"
          style={{ backgroundColor: mode.color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className={cn("line-clamp-2 text-[15px] leading-snug", active ? "font-semibold text-brand" : "text-text")}>
            {conversation.title}
          </span>
          <span className="mt-0.5 block font-mono text-[12px] text-faint">
            {formatRelativeDay(conversation.updatedAt)}
          </span>
        </span>
      </button>
      <Menu
        trigger={<MoreVertical className="h-4 w-4" aria-hidden />}
        ariaLabel={`Options for "${conversation.title}"`}
        items={[
          { label: "Rename", icon: <Pencil className="h-3.5 w-3.5" aria-hidden />, onClick: () => setEditing(true) },
          { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" aria-hidden />, onClick: handleDelete, danger: true },
        ]}
      />
    </div>
  );
}

// Sidebar re-renders on every ChatContext change (streaming, etc.); memoized
// so items for conversations that aren't the one actively changing bail out
// instead of re-rendering the whole list on every chunk.
export const ConversationItem = memo(ConversationItemImpl);
