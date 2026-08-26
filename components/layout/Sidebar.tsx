"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MessageCircle, Settings, LogOut, X, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { useAuth } from "@/lib/context/AuthContext";
import { MODE_LIST } from "@/lib/modes";
import { ConversationItem } from "./ConversationItem";
import { NewChatMenu } from "./NewChatMenu";
import { Avatar } from "@/components/ui/Avatar";
import { cn, getDateGroup, type DateGroup } from "@/lib/utils";
import { readStorage, writeStorage } from "@/lib/storage";

const DATE_GROUPS: DateGroup[] = ["Today", "Yesterday", "Earlier"];

const COLLAPSE_KEY = "ask-meta-ai:sidebar-collapsed";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { conversations, deleteConversation, renameConversation } = useChat();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const activeId = params?.conversationId;
  const [collapsed, setCollapsed] = useState(false);

  // On first load: honor a saved preference, otherwise default to collapsed
  // on medium ("tablet/small laptop") widths where a full sidebar crowds
  // the conversation. Phones already get the drawer pattern below md.
  useEffect(() => {
    const stored = readStorage<boolean | null>(COLLAPSE_KEY, null);
    if (stored !== null) {
      setCollapsed(stored);
    } else if (window.innerWidth >= 768 && window.innerWidth < 1280) {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      writeStorage(COLLAPSE_KEY, next);
      return next;
    });
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[304px] flex-none flex-col border-r border-border-soft bg-surface transition-all md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "md:w-20"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between px-4 pt-4",
            collapsed && "md:flex-col md:justify-center md:gap-2 md:px-0"
          )}
        >
          <Link
            href="/dashboard"
            className={cn("flex items-center gap-2 font-display text-base font-semibold text-text", collapsed && "md:justify-center")}
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-brand text-white">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className={cn(collapsed && "md:hidden")}>Arova</span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-border-soft md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <button
            onClick={toggleCollapsed}
            className="hidden rounded-md p-1.5 text-faint transition-colors hover:bg-border-soft hover:text-text md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {/* New chat */}
        <div className={cn("px-4 pt-4", collapsed && "md:px-0")}>
          <NewChatMenu collapsed={collapsed} onNavigate={onClose} />
        </div>

        {/* Conversation list — expanded rows, grouped by day */}
        <div className={cn("mt-4 flex-1 overflow-y-auto px-3 pb-3", collapsed && "md:hidden")}>
          {conversations.length === 0 ? (
            <p className="px-2.5 pb-1 text-[13px] text-faint">No conversations yet</p>
          ) : (
            DATE_GROUPS.map((group) => {
              const groupConversations = conversations
                .filter((c) => getDateGroup(c.updatedAt) === group)
                .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
              if (groupConversations.length === 0) return null;
              return (
                <div key={group} className="mt-5 border-t border-border-soft pt-4 first:mt-0 first:border-t-0 first:pt-0">
                  <p className="px-2.5 pb-2 font-mono text-[13px] font-bold uppercase tracking-widest text-faint">
                    {group}
                  </p>
                  <div className="flex flex-col gap-1">
                    {groupConversations.map((c) => (
                      <ConversationItem
                        key={c.id}
                        conversation={c}
                        active={c.id === activeId}
                        onDelete={deleteConversation}
                        onRename={renameConversation}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Conversation list — collapsed rail (desktop only) */}
        {collapsed && (
          <div className="hidden flex-1 overflow-y-auto py-3 md:flex md:flex-col md:items-center md:gap-2">
            {conversations
              .slice()
              .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
              .map((c) => {
                const mode = MODE_LIST.find((m) => m.id === c.mode)!;
                const active = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    title={c.title}
                    onClick={() => router.push(`/chat/${c.id}`)}
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-sm font-semibold"
                    style={{
                      backgroundColor: mode.colorSoft,
                      color: mode.color,
                      boxShadow: active ? `0 0 0 2px ${mode.color}` : undefined,
                    }}
                  >
                    {c.title.trim().charAt(0).toUpperCase() || "?"}
                  </button>
                );
              })}
          </div>
        )}

        {/* Footer — expanded */}
        <div className={cn("border-t border-border-soft p-3", collapsed && "md:hidden")}>
          <Link href="/settings" className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-border-soft">
            <Avatar name={user?.name ?? "?"} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-text">{user?.name}</span>
              <span className="block truncate text-[12px] text-faint">
                {user?.isGuest ? "Guest — sign in to save history" : "Conversations saved to your account"}
              </span>
            </span>
            <Settings className="h-4 w-4 flex-none text-faint" aria-hidden />
          </Link>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[15px] text-muted hover:bg-border-soft hover:text-text"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>

        {/* Footer — collapsed rail (desktop only) */}
        {collapsed && (
          <div className="hidden flex-col items-center gap-2 border-t border-border-soft py-3 md:flex">
            <Link href="/settings" title="Settings" className="rounded-full hover:opacity-80">
              <Avatar name={user?.name ?? "?"} size="sm" />
            </Link>
            <button
              onClick={signOut}
              title="Log out"
              className="flex h-8 w-8 items-center justify-center rounded-full text-faint hover:bg-border-soft hover:text-text"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
