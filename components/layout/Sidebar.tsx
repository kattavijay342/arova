"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  MessageCircle,
  MessagesSquare,
  FolderClosed,
  Search,
  Settings,
  LogOut,
  X,
  ChevronsLeft,
  ChevronsRight,
  FolderPlus,
} from "lucide-react";
import { useChat } from "@/lib/context/ChatContext";
import { useAuth } from "@/lib/context/AuthContext";
import { useProjects } from "@/lib/context/ProjectContext";
import { ConversationItem } from "./ConversationItem";
import { ProjectItem } from "./ProjectItem";
import { ConversationSearch } from "./ConversationSearch";
import { NewChatMenu } from "./NewChatMenu";
import { Avatar } from "@/components/ui/Avatar";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn, getDateGroup, type DateGroup } from "@/lib/utils";
import { readStorage, writeStorage } from "@/lib/storage";
import type { Conversation } from "@/lib/types";

// How long to wait after the user stops typing before hitting the search
// API — avoids firing a request per keystroke.
const SEARCH_DEBOUNCE_MS = 300;

// Shared by every icon-only button in the collapsed rail so focus is always
// visible for keyboard users (mirrors components/chat/MessageInput.tsx's
// TOOL_BUTTON_FOCUS convention).
const RAIL_BUTTON_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const DATE_GROUPS: DateGroup[] = ["Today", "Yesterday", "Earlier"];

const COLLAPSE_KEY = "ask-meta-ai:sidebar-collapsed";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    conversations,
    deleteConversation,
    renameConversation,
    moveConversationToProject,
    refreshConversations,
    searchConversations,
  } = useChat();
  const { projects, createProject, renameProject, deleteProject } = useProjects();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const params = useParams<{ conversationId?: string; projectId?: string }>();
  const activeId = params?.conversationId;
  const activeProjectId = params?.projectId;
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  // Set right before expanding from a collapsed-rail icon click (Search),
  // so the search input can be focused once it's actually back in the DOM —
  // it's unmounted while collapsed (see the `collapsed && "md:hidden"` guard
  // below), so focusing it synchronously on click would be a no-op.
  const [pendingSearchFocus, setPendingSearchFocus] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Conversations inside a project are shown on that project's own page
  // instead — excluded here so they don't appear in both places.
  const ungroupedConversations = useMemo(() => conversations.filter((c) => !c.projectId), [conversations]);

  // Conversation messages are no longer loaded up front (see
  // Conversation.messagesLoaded / lib/context/ChatContext.tsx), so content
  // search can't filter client-side anymore — it hits the server's `?q=`
  // search instead, which covers both titles and message content. Debounced
  // so it fires once typing pauses rather than per keystroke, and guarded
  // against out-of-order responses with a request counter.
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRequestIdRef = useRef(0);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      searchRequestIdRef.current++;
      setSearchResults(null);
      setSearchedQuery(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const requestId = ++searchRequestIdRef.current;
    const timer = setTimeout(async () => {
      try {
        const results = await searchConversations(q);
        if (searchRequestIdRef.current === requestId) {
          setSearchResults(results);
          setSearchedQuery(q);
        }
      } catch (err) {
        console.error("[sidebar] search failed:", err);
        if (searchRequestIdRef.current === requestId) {
          setSearchResults([]);
          setSearchedQuery(q);
        }
      } finally {
        if (searchRequestIdRef.current === requestId) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, searchConversations]);

  const trimmedQuery = searchQuery.trim();
  // True until the debounced search has actually resolved for the query
  // currently in the box — used to avoid flashing stale results from a
  // previous query while the new one is still in flight.
  const isSearchPending = trimmedQuery !== "" && (searching || searchedQuery !== trimmedQuery);
  const filteredConversations = trimmedQuery === "" ? ungroupedConversations : searchResults ?? [];

  async function handleCreateProject() {
    const name = newProjectName.trim();
    setCreatingProject(false);
    setNewProjectName("");
    if (!name) return;
    try {
      const id = await createProject(name);
      onClose();
      router.push(`/projects/${id}`);
    } catch (err) {
      console.error("[projects] failed to create:", err);
    }
  }

  async function handleDeleteProject(id: string) {
    await deleteProject(id);
    void refreshConversations();
  }

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

  // Collapsed-rail icons for Conversations/Projects/Search don't duplicate
  // that UI in 68px of width — they expand the sidebar to reveal it, same
  // destination as clicking the chevron, just one click from a different
  // icon. Nothing is removed, it's one extra click away.
  function expand() {
    setCollapsed(false);
    writeStorage(COLLAPSE_KEY, false);
  }

  function expandAndFocusSearch() {
    setPendingSearchFocus(true);
    expand();
  }

  useEffect(() => {
    if (!collapsed && pendingSearchFocus) {
      searchInputRef.current?.focus();
      setPendingSearchFocus(false);
    }
  }, [collapsed, pendingSearchFocus]);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[252px] flex-none flex-col border-r border-border-soft bg-surface transition-all duration-200 ease-in-out md:static md:z-auto md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "md:w-[68px]"
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
            aria-label="Arova — go to dashboard"
            className={cn(
              "flex items-center gap-2 rounded-md font-display text-base font-semibold text-text",
              RAIL_BUTTON_FOCUS,
              collapsed && "md:justify-center"
            )}
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-brand text-white">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className={cn(collapsed && "md:hidden")}>Arova</span>
          </Link>
          <button
            onClick={onClose}
            className={cn("rounded-md p-1 text-muted hover:bg-border-soft md:hidden", RAIL_BUTTON_FOCUS)}
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="hidden md:inline-flex">
            <button
              onClick={toggleCollapsed}
              className={cn(
                "hidden rounded-md p-1.5 text-faint transition-colors hover:bg-border-soft hover:text-text md:inline-flex",
                RAIL_BUTTON_FOCUS
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronsRight className="h-4 w-4" aria-hidden /> : <ChevronsLeft className="h-4 w-4" aria-hidden />}
            </button>
          </Tooltip>
        </div>

        {/* New chat */}
        <div className={cn("px-4 pt-4", collapsed && "md:px-0")}>
          <NewChatMenu collapsed={collapsed} onNavigate={onClose} />
        </div>

        {/* Projects */}
        <div className={cn("mt-4 px-3", collapsed && "md:hidden")}>
          <div className="flex items-center justify-between px-2.5 pb-1">
            <p className="font-mono text-[13px] font-bold uppercase tracking-widest text-faint">Projects</p>
            <button
              onClick={() => setCreatingProject(true)}
              className={cn("rounded-md p-1 text-faint transition-colors hover:bg-border-soft hover:text-text", RAIL_BUTTON_FOCUS)}
              aria-label="New project"
              title="New project"
            >
              <FolderPlus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {creatingProject && (
            <div className="px-2.5 pb-1">
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onBlur={handleCreateProject}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateProject();
                  if (e.key === "Escape") {
                    setNewProjectName("");
                    setCreatingProject(false);
                  }
                }}
                placeholder="Project name"
                className="w-full rounded-md border border-brand bg-surface px-2.5 py-1.5 text-[15px] text-text focus:outline-none"
              />
            </div>
          )}
          {projects.length > 0 && (
            <div className="flex flex-col gap-1">
              {projects.map((p) => (
                <ProjectItem
                  key={p.id}
                  project={p}
                  active={p.id === activeProjectId}
                  onDelete={handleDeleteProject}
                  onRename={renameProject}
                />
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        {ungroupedConversations.length > 0 && (
          <div className={cn("px-4 pt-3", collapsed && "md:hidden")}>
            <ConversationSearch ref={searchInputRef} value={searchQuery} onChange={setSearchQuery} />
          </div>
        )}

        {/* Conversation list — expanded rows, grouped by day */}
        <div className={cn("mt-4 flex-1 overflow-y-auto px-3 pb-3", collapsed && "md:hidden")}>
          {ungroupedConversations.length === 0 ? (
            <p className="px-2.5 pb-1 text-[13px] text-faint">No conversations yet</p>
          ) : isSearchPending ? (
            <p className="px-2.5 pb-1 text-[13px] text-faint">Searching…</p>
          ) : filteredConversations.length === 0 ? (
            <p className="px-2.5 pb-1 text-[13px] text-faint">No conversations match &ldquo;{trimmedQuery}&rdquo;</p>
          ) : (
            DATE_GROUPS.map((group) => {
              const groupConversations = filteredConversations
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
                        projects={projects}
                        onMove={moveConversationToProject}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Collapsed rail (desktop only) — generic icon nav instead of the
            expanded panels below; each icon expands the sidebar to reveal
            the section it represents, so nothing is actually removed. */}
        {collapsed && (
          <div className="hidden flex-1 flex-col items-center gap-1 py-3 md:flex">
            <Tooltip label="Conversations">
              <button
                onClick={expand}
                aria-label="Show conversations"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg text-faint transition-colors hover:bg-border-soft hover:text-text",
                  RAIL_BUTTON_FOCUS
                )}
              >
                <MessagesSquare className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </Tooltip>
            <Tooltip label="Projects">
              <button
                onClick={expand}
                aria-label="Show projects"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg text-faint transition-colors hover:bg-border-soft hover:text-text",
                  RAIL_BUTTON_FOCUS
                )}
              >
                <FolderClosed className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </Tooltip>
            {ungroupedConversations.length > 0 && (
              <Tooltip label="Search">
                <button
                  onClick={expandAndFocusSearch}
                  aria-label="Search conversations"
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-faint transition-colors hover:bg-border-soft hover:text-text",
                    RAIL_BUTTON_FOCUS
                  )}
                >
                  <Search className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </Tooltip>
            )}
          </div>
        )}

        {/* Footer — expanded */}
        <div className={cn("border-t border-border-soft p-3", collapsed && "md:hidden")}>
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-border-soft",
              RAIL_BUTTON_FOCUS
            )}
          >
            <Avatar name={user?.name ?? "?"} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-text">{user?.name}</span>
              <span className="block truncate text-[12px] text-faint">
                {user?.isGuest ? "Guest — sign in to save history" : "Free plan"}
              </span>
            </span>
            <Settings className="h-4 w-4 flex-none text-faint" aria-hidden />
          </Link>
          <button
            onClick={signOut}
            className={cn(
              "mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[15px] text-muted transition-colors hover:bg-border-soft hover:text-text",
              RAIL_BUTTON_FOCUS
            )}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>

        {/* Footer — collapsed rail (desktop only) */}
        {collapsed && (
          <div className="hidden flex-col items-center gap-2 border-t border-border-soft py-3 md:flex">
            <Tooltip label={user?.name ?? "Account"}>
              <Link
                href="/settings"
                aria-label="Account"
                className={cn("rounded-full transition-opacity hover:opacity-80", RAIL_BUTTON_FOCUS)}
              >
                <Avatar name={user?.name ?? "?"} size="sm" />
              </Link>
            </Tooltip>
            <Tooltip label="Settings">
              <Link
                href="/settings"
                aria-label="Settings"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-border-soft hover:text-text",
                  RAIL_BUTTON_FOCUS
                )}
              >
                <Settings className="h-4 w-4" aria-hidden />
              </Link>
            </Tooltip>
            <Tooltip label="Log out">
              <button
                onClick={signOut}
                aria-label="Log out"
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-faint transition-colors hover:bg-border-soft hover:text-text",
                  RAIL_BUTTON_FOCUS
                )}
              >
                <LogOut className="h-4 w-4" aria-hidden />
              </button>
            </Tooltip>
          </div>
        )}
      </aside>
    </>
  );
}
