"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { ChatStatus, Conversation, FeedbackRating, Message, MessageAttachment, Mode } from "../types";
import { generateId, truncate } from "../utils";
import { hasDatasetBlock } from "../dataset";
import { useAuth } from "./AuthContext";

interface ChatState {
  conversations: Conversation[];
  status: ChatStatus;
  error: string | null;
  lastFailedMessage: {
    conversationId: string;
    text: string;
    attachment?: MessageAttachment | null;
    webSearch?: boolean;
    deepResearch?: boolean;
    jobFitAnalysis?: boolean;
  } | null;
  hydrated: boolean;
  // Kept separate from `status`/`error` (rather than reused) so an
  // in-flight/failed image generation never gets confused with, or blocks,
  // an unrelated ordinary text send in the same conversation.
  imageGenerating: boolean;
  imageGenerationError: string | null;
  // True for the *entire* duration of a streaming reply — unlike `status`,
  // which flips back to "idle" the moment the first chunk arrives (so the
  // typing indicator can hand off to the growing message bubble). Without
  // this, the composer and Stop button would both key off `status`, which
  // would silently re-enable sending a second message partway through the
  // first one's reply instead of keeping Stop available the whole time.
  isStreaming: boolean;
  // Only set during the pre-first-chunk window of a web-search,
  // deep-research, or data-analysis send (cleared the moment the first chunk
  // arrives, same point `status` itself flips back to "idle" — see
  // postAndHandleReply) — lets the typing indicator say what's actually
  // happening (see MessageList.tsx) instead of a generic "thinking" state
  // for however long Google Search grounding or code execution takes before
  // the model starts producing output.
  searchingWeb: "web" | "deep" | "data" | null;
}

type Action =
  | { type: "HYDRATE"; conversations: Conversation[] }
  | { type: "ADD_CONVERSATION"; conversation: Conversation }
  | { type: "ADD_MESSAGE"; conversationId: string; message: Message; retitle?: string }
  | { type: "UPDATE_MESSAGE_CONTENT"; conversationId: string; messageId: string; content: string }
  | { type: "REPLACE_MESSAGE"; conversationId: string; messageId: string; message: Message }
  | {
      type: "SYNC_USER_MESSAGE_ID";
      conversationId: string;
      tempId: string;
      realId: string;
      createdAt: string;
      content: string;
      hasFileAttachment: boolean;
    }
  | { type: "REMOVE_MESSAGE"; conversationId: string; messageId: string }
  | { type: "REMOVE_MESSAGES"; conversationId: string; messageIds: string[] }
  | { type: "EDIT_MESSAGE_AND_TRIM"; conversationId: string; messageId: string; content: string }
  | { type: "SET_MESSAGES"; conversationId: string; messages: Message[] }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "CLEAR_ALL" }
  | { type: "RENAME_CONVERSATION"; id: string; title: string }
  | { type: "MOVE_CONVERSATION"; id: string; projectId: string | null }
  | { type: "SET_STATUS"; status: ChatStatus; error?: string | null }
  | {
      type: "SET_LAST_FAILED";
      value: {
        conversationId: string;
        text: string;
        attachment?: MessageAttachment | null;
        webSearch?: boolean;
        deepResearch?: boolean;
        jobFitAnalysis?: boolean;
      } | null;
    }
  | { type: "SET_MESSAGE_FEEDBACK"; conversationId: string; messageId: string; feedback: FeedbackRating | null }
  | { type: "SET_IMAGE_GENERATION_STATUS"; generating: boolean; error?: string | null }
  | { type: "SET_STREAMING"; streaming: boolean }
  | { type: "SET_SEARCHING_WEB"; searching: "web" | "deep" | "data" | null };

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, conversations: action.conversations, hydrated: true };
    case "ADD_CONVERSATION":
      return { ...state, conversations: [action.conversation, ...state.conversations] };
    case "ADD_MESSAGE":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? {
                ...c,
                title: action.retitle ?? c.title,
                messages: [...c.messages, action.message],
                updatedAt: action.message.createdAt,
              }
            : c
        ),
      };
    case "UPDATE_MESSAGE_CONTENT":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === action.messageId ? { ...m, content: action.content } : m
                ),
              }
            : c
        ),
      };
    case "REPLACE_MESSAGE":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map((m) => (m.id === action.messageId ? action.message : m)),
                updatedAt: action.message.createdAt,
              }
            : c
        ),
      };
    // Reconciles the client-generated temp id a just-sent user message was
    // optimistically added under (see sendMessage) with its real database
    // id, once the server reports it — see postAndHandleReply's handling of
    // the "user_message" stream event. Merges rather than replaces (unlike
    // REPLACE_MESSAGE) so client-only fields with no server-side equivalent
    // (imageDataUrl, documentMeta, datasetMeta) survive; without this, any
    // action addressed by message id — Edit, Delete, feedback — would 404
    // against a temp id that was never a real row, until a full reload
    // re-hydrated the conversation from the server.
    case "SYNC_USER_MESSAGE_ID":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === action.tempId
                    ? {
                        ...m,
                        id: action.realId,
                        createdAt: action.createdAt,
                        content: action.content,
                        hasFileAttachment: action.hasFileAttachment,
                      }
                    : m
                ),
              }
            : c
        ),
      };
    case "REMOVE_MESSAGE":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? { ...c, messages: c.messages.filter((m) => m.id !== action.messageId) }
            : c
        ),
      };
    // Deleting a user question also removes its paired assistant reply (see
    // deleteMessage) — both are removed from local state in one update so
    // the UI never shows an orphan answer even for the single render between
    // the two.
    case "REMOVE_MESSAGES":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? { ...c, messages: c.messages.filter((m) => !action.messageIds.includes(m.id)) }
            : c
        ),
      };
    case "EDIT_MESSAGE_AND_TRIM":
      return {
        ...state,
        conversations: state.conversations.map((c) => {
          if (c.id !== action.conversationId) return c;
          const index = c.messages.findIndex((m) => m.id === action.messageId);
          if (index === -1) return c;
          const edited = { ...c.messages[index], content: action.content };
          return { ...c, messages: [...c.messages.slice(0, index), edited] };
        }),
      };
    case "SET_MESSAGES":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId ? { ...c, messages: action.messages, messagesLoaded: true } : c
        ),
      };
    case "DELETE_CONVERSATION":
      return { ...state, conversations: state.conversations.filter((c) => c.id !== action.id) };
    case "CLEAR_ALL":
      return { ...state, conversations: [] };
    case "RENAME_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.id ? { ...c, title: action.title } : c
        ),
      };
    case "MOVE_CONVERSATION":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.id ? { ...c, projectId: action.projectId } : c
        ),
      };
    case "SET_STATUS":
      return { ...state, status: action.status, error: action.error ?? null };
    case "SET_LAST_FAILED":
      return { ...state, lastFailedMessage: action.value };
    case "SET_MESSAGE_FEEDBACK":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === action.messageId ? { ...m, feedback: action.feedback } : m
                ),
              }
            : c
        ),
      };
    case "SET_IMAGE_GENERATION_STATUS":
      return { ...state, imageGenerating: action.generating, imageGenerationError: action.error ?? null };
    case "SET_STREAMING":
      return { ...state, isStreaming: action.streaming };
    case "SET_SEARCHING_WEB":
      return { ...state, searchingWeb: action.searching };
    default:
      return state;
  }
}

interface ChatContextValue {
  conversations: Conversation[];
  status: ChatStatus;
  error: string | null;
  hydrated: boolean;
  imageGenerating: boolean;
  imageGenerationError: string | null;
  /** True for the entire duration of a streaming reply — see ChatState.isStreaming. */
  isStreaming: boolean;
  /** Non-null only during the pre-first-chunk window of a web-search/deep-research/data-analysis send — see ChatState.searchingWeb. */
  searchingWeb: "web" | "deep" | "data" | null;
  getConversation: (id: string) => Conversation | undefined;
  refreshConversations: () => Promise<void>;
  /** Fetches a conversation's real messages on demand (see Conversation.messagesLoaded) — a no-op if they're already loaded or already being fetched. */
  ensureMessagesLoaded: (conversationId: string) => Promise<void>;
  /** Server-side search across conversation titles and message content (see GET /api/conversations?q=). Returns the matching lightweight conversations; does not touch existing state. */
  searchConversations: (query: string) => Promise<Conversation[]>;
  createConversation: (mode: Mode, projectId?: string) => Promise<string>;
  sendMessage: (
    conversationId: string,
    text: string,
    attachment?: MessageAttachment | null,
    webSearch?: boolean,
    deepResearch?: boolean,
    jobFitAnalysis?: boolean
  ) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  /** Aborts the currently streaming reply, if any, keeping whatever partial content was generated so far. */
  stopGenerating: () => void;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  moveConversationToProject: (id: string, projectId: string | null) => void;
  clearAllConversations: () => void;
  dismissError: () => void;
  submitFeedback: (conversationId: string, messageId: string, rating: FeedbackRating) => void;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  /** Deletes the given assistant reply and regenerates it from scratch. Only meaningful for a conversation's last message. */
  regenerateResponse: (conversationId: string, messageId: string) => Promise<void>;
  generateImage: (conversationId: string, prompt: string) => Promise<void>;
  dismissImageGenerationError: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// ── Raw API shapes (snake_case, as stored in Postgres) → app types ────────

interface RawMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  message_feedback?: { rating: FeedbackRating }[];
  attachment_path?: string | null;
}

interface RawConversation {
  id: string;
  mode: Mode;
  title: string;
  created_at: string;
  updated_at: string;
  project_id?: string | null;
  messages?: RawMessage[];
}

function mapMessage(m: RawMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    feedback: m.message_feedback?.[0]?.rating ?? null,
    hasFileAttachment: Boolean(m.attachment_path),
  };
}

function mapConversation(c: RawConversation): Conversation {
  return {
    id: c.id,
    mode: c.mode,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    projectId: c.project_id ?? null,
    messages: (c.messages ?? []).map(mapMessage),
    // The lightweight list endpoint (GET /api/conversations) omits `messages`
    // entirely now — its absence means "not fetched," not "empty." The
    // single-conversation endpoint (GET /api/conversations/[id]) always
    // includes it (as [] for a genuinely empty conversation), so this
    // correctly reads as loaded there. Freshly-created conversations are
    // corrected to `true` explicitly by their own caller (createConversation)
    // since POST's response shape matches the lightweight one but is, in
    // fact, a real (empty) conversation.
    messagesLoaded: c.messages !== undefined,
  };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

async function fetchConversationMessages(conversationId: string): Promise<Message[]> {
  const row = await apiFetch<RawConversation>(`/api/conversations/${conversationId}`);
  return mapConversation(row).messages;
}

/**
 * After a client-initiated stop, waits briefly for the server to finish
 * persisting the partial reply (a single DB insert, but the abort still
 * needs a moment to propagate before that runs) then replaces the
 * locally-accumulated streaming message with the real persisted one —
 * otherwise a stopped reply would keep its client-generated id forever, and
 * Edit/Delete/feedback on it would 404. Retries with backoff rather than
 * firing once immediately: an immediate fetch would almost always land
 * before the server's insert and wrongly read as "nothing new," clobbering
 * the correct partial content already on screen with the pre-reply state.
 * Gives up silently (leaving the local partial content as-is) if the server
 * never catches up within the retry window — a working temp id is better
 * than losing a reply the user can plainly see was generated.
 */
async function reconcileStoppedReply(
  conversationId: string,
  dispatch: (action: Action) => void,
  messageCountBeforeThisTurn: number
) {
  const RETRY_DELAYS_MS = [400, 900, 1600];
  for (const delayMs of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const messages = await fetchConversationMessages(conversationId);
      if (messages.length > messageCountBeforeThisTurn) {
        dispatch({ type: "SET_MESSAGES", conversationId, messages });
        return;
      }
    } catch (err) {
      console.error("[chat] failed to reconcile a stopped reply:", err);
      return;
    }
  }
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    conversations: [],
    status: "idle",
    error: null,
    lastFailedMessage: null,
    hydrated: false,
    imageGenerating: false,
    imageGenerationError: null,
    isStreaming: false,
    searchingWeb: null,
  });

  // Always-current snapshot of `state.conversations` for callbacks below that
  // need to read it without taking it as a dependency — those callbacks are
  // passed to list items (MessageBubble, ConversationItem) that are memoized
  // specifically so they *don't* re-render on every conversations change, so
  // their callback props must stay referentially stable too.
  const conversationsRef = useRef(state.conversations);
  useEffect(() => {
    conversationsRef.current = state.conversations;
  }, [state.conversations]);

  // The AbortController backing the currently in-flight streaming reply, if
  // any — only one send can be in flight at a time (the UI gates on the
  // shared `status === "loading"`), so a single ref is enough. Set at the
  // start of postAndHandleReply, cleared when it finishes (however it
  // finishes); stopGenerating() just aborts whatever's here.
  const activeStreamControllerRef = useRef<AbortController | null>(null);

  // Keyed on the user id (a stable primitive), not the `user` object itself:
  // AuthContext builds a brand-new `user` object both on the initial
  // getSession() resolution and on the onAuthStateChange callback that fires
  // right after it — two different object references for the same signed-in
  // user. Keying on the object would re-run this effect (and re-fetch this
  // expensive, joined query) twice on every single page load.
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    apiFetch<RawConversation[]>("/api/conversations")
      .then((rows) => {
        if (!cancelled) dispatch({ type: "HYDRATE", conversations: rows.map(mapConversation) });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[chat] failed to load conversations:", err);
          dispatch({ type: "HYDRATE", conversations: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Re-fetches the full conversation list from the server. Needed after
  // deleting a project: `conversations.project_id` is cleared server-side
  // (`on delete set null`), but the client's already-hydrated copy has no
  // way to know that on its own since projects live in a separate context.
  const refreshConversations = useCallback(async () => {
    try {
      const rows = await apiFetch<RawConversation[]>("/api/conversations");
      dispatch({ type: "HYDRATE", conversations: rows.map(mapConversation) });
    } catch (err) {
      console.error("[chat] failed to refresh conversations:", err);
    }
  }, []);

  const getConversation = useCallback(
    (id: string) => state.conversations.find((c) => c.id === id),
    [state.conversations]
  );

  const createConversation = useCallback(async (mode: Mode, projectId?: string): Promise<string> => {
    const row = await apiFetch<RawConversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(projectId ? { mode, projectId } : { mode }),
    });
    // POST's response has the same shape as the lightweight list endpoint
    // (no `messages` field), which mapConversation would otherwise read as
    // "not loaded yet" — but a conversation this code itself just created
    // genuinely has zero messages, not unknown ones.
    const conversation = { ...mapConversation(row), messagesLoaded: true };
    dispatch({ type: "ADD_CONVERSATION", conversation });
    return conversation.id;
  }, []);

  /**
   * POSTs the message and streams the assistant reply in progressively,
   * chunk by chunk, instead of waiting for the full response. Does not
   * touch the user bubble — callers add that themselves (or leave the
   * existing one, on retry).
   *
   * The response body is newline-delimited JSON events (see the route
   * handler): {"type":"chunk"|"done"|"error", ...}. A placeholder assistant
   * message is created on the first chunk and its content grows in place
   * as more chunks arrive; on "done" it's swapped for the real persisted
   * message (same content, real id/timestamp); on failure it's removed,
   * matching the old behavior where a failed send never left a partial
   * assistant bubble behind.
   */
  const postAndHandleReply = useCallback(
    async (
      conversationId: string,
      text: string,
      attachment?: MessageAttachment | null,
      webSearch?: boolean,
      deepResearch?: boolean,
      jobFitAnalysis?: boolean,
      // The temp client-generated id the just-added optimistic user message
      // is holding (see sendMessage) — reconciled with the real database id
      // as soon as the server reports it, so Edit/Delete/feedback on that
      // message work without needing a page reload first. Omitted by
      // editMessage/retryLastMessage, which don't add a new message.
      localUserMessageId?: string
    ) => {
      dispatch({ type: "SET_STATUS", status: "loading" });
      dispatch({ type: "SET_STREAMING", streaming: true });

      // Read before anything else in this turn is dispatched — for every
      // caller (sendMessage, editMessage, retryLastMessage,
      // regenerateResponse), this ref is guaranteed to still reflect the
      // conversation's state *before* this turn's messages, whether because
      // no dispatch happened yet this tick (sendMessage, called
      // synchronously right after its own optimistic dispatch — the ref's
      // own sync effect hasn't run yet) or because a real network await
      // already let it catch up to a dispatch that already happened
      // (editMessage/regenerateResponse). Used only if generation is
      // stopped, to recognize once the server's partial reply lands.
      const conversationBeforeThisTurn = conversationsRef.current.find((c) => c.id === conversationId);
      const messageCountBeforeThisTurn = conversationBeforeThisTurn?.messages.length ?? 0;

      if (deepResearch) dispatch({ type: "SET_SEARCHING_WEB", searching: "deep" });
      else if (webSearch) dispatch({ type: "SET_SEARCHING_WEB", searching: "web" });
      // Mirrors the server's own `hasDataset` check (see the messages route):
      // code execution — and therefore this "Analyzing data…" indicator —
      // stays active for follow-up questions about a dataset uploaded
      // earlier in the conversation, not just the turn it was attached on.
      else if (
        attachment?.kind === "dataset" ||
        conversationBeforeThisTurn?.messages.some((m) => hasDatasetBlock(m.content))
      ) {
        dispatch({ type: "SET_SEARCHING_WEB", searching: "data" });
      }

      const controller = new AbortController();
      activeStreamControllerRef.current = controller;

      const streamMessageId = generateId();
      let started = false;
      let accumulated = "";

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            content: text,
            ...(attachment ? { attachment } : {}),
            ...(webSearch ? { webSearch } : {}),
            ...(deepResearch ? { deepResearch } : {}),
            ...(jobFitAnalysis ? { jobFitAnalysis } : {}),
          }),
        });

        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Inactivity watchdog, not a total-duration timeout — reset on every
        // chunk, so a long-but-actively-streaming reply (a lengthy Deep
        // Research report, say) never trips it, but a connection that goes
        // completely silent (a hung Gemini call, a dropped connection) can't
        // leave the user staring at a loading state forever with no
        // recourse. Cancelling the reader resolves the pending `read()` with
        // `done: true` rather than rejecting it, so `timedOut` is what turns
        // that into a real, retryable error instead of a silent stop.
        const STREAM_INACTIVITY_TIMEOUT_MS = 45_000;
        let timedOut = false;
        let inactivityTimer: ReturnType<typeof setTimeout>;
        const resetInactivityTimer = () => {
          clearTimeout(inactivityTimer);
          inactivityTimer = setTimeout(() => {
            timedOut = true;
            reader.cancel().catch(() => {});
          }, STREAM_INACTIVITY_TIMEOUT_MS);
        };
        resetInactivityTimer();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (timedOut) throw new Error("The assistant is taking too long to respond. Please try again.");
            break;
          }
          resetInactivityTimer();
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            newlineIndex = buffer.indexOf("\n");
            if (!line) continue;

            const event = JSON.parse(line) as
              | { type: "user_message"; message: RawMessage }
              | { type: "chunk"; delta: string }
              | { type: "done"; assistantMessage: RawMessage }
              | { type: "error"; code: string; message: string };

            if (event.type === "user_message") {
              if (localUserMessageId) {
                dispatch({
                  type: "SYNC_USER_MESSAGE_ID",
                  conversationId,
                  tempId: localUserMessageId,
                  realId: event.message.id,
                  createdAt: event.message.created_at,
                  content: event.message.content,
                  hasFileAttachment: Boolean(event.message.attachment_path),
                });
              }
            } else if (event.type === "chunk") {
              accumulated += event.delta;
              if (!started) {
                started = true;
                dispatch({
                  type: "ADD_MESSAGE",
                  conversationId,
                  message: {
                    id: streamMessageId,
                    role: "assistant",
                    content: accumulated,
                    createdAt: new Date().toISOString(),
                  },
                });
                dispatch({ type: "SET_STATUS", status: "idle" });
              } else {
                dispatch({ type: "UPDATE_MESSAGE_CONTENT", conversationId, messageId: streamMessageId, content: accumulated });
              }
            } else if (event.type === "done") {
              dispatch({
                type: "REPLACE_MESSAGE",
                conversationId,
                messageId: streamMessageId,
                message: mapMessage(event.assistantMessage),
              });
            } else {
              throw new Error(event.message);
            }
          }
        }

        clearTimeout(inactivityTimer!);
        dispatch({ type: "SET_LAST_FAILED", value: null });
      } catch (err) {
        // A "Stop generating" click (or the tab closing/navigating away
        // mid-stream) aborts this fetch, which rejects with this exact
        // error — not a real failure, so it's handled entirely differently
        // from every other error below: the partial reply already shown is
        // kept (never removed), status goes back to idle (not "error"),
        // and there's nothing to offer retrying since the user chose to
        // stop, not fail. The server still persists whatever text was
        // generated before the stop (see the messages route) — once it
        // does, reconcile the locally-accumulated message's temp id with
        // the real persisted one so Edit/Delete/feedback on it work
        // without needing a reload first.
        if (err instanceof DOMException && err.name === "AbortError") {
          dispatch({ type: "SET_STATUS", status: "idle" });
          if (started) {
            void reconcileStoppedReply(conversationId, dispatch, messageCountBeforeThisTurn);
          }
          return;
        }
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (started) dispatch({ type: "REMOVE_MESSAGE", conversationId, messageId: streamMessageId });
        dispatch({ type: "SET_STATUS", status: "error", error: message });
        dispatch({
          type: "SET_LAST_FAILED",
          value: { conversationId, text, attachment, webSearch, deepResearch, jobFitAnalysis },
        });
      } finally {
        if (activeStreamControllerRef.current === controller) {
          activeStreamControllerRef.current = null;
        }
        dispatch({ type: "SET_STREAMING", streaming: false });
        // Covers every exit path uniformly (success, error, abort, stop) —
        // simpler and more robust than clearing it individually at each of
        // those sites, several of which are deep inside the streaming loop
        // above. A no-op if it was never set (a plain send).
        dispatch({ type: "SET_SEARCHING_WEB", searching: null });
      }
    },
    []
  );

  // Aborts the currently in-flight streaming reply, if any — a no-op
  // otherwise (e.g. the reply already finished by the time the click
  // lands). See postAndHandleReply's AbortError handling for what happens
  // next: the partial reply already on screen is kept, not discarded.
  const stopGenerating = useCallback(() => {
    activeStreamControllerRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (
      conversationId: string,
      text: string,
      attachment?: MessageAttachment | null,
      webSearch?: boolean,
      deepResearch?: boolean,
      jobFitAnalysis?: boolean
    ) => {
      const trimmed = text.trim();
      if (!trimmed && !attachment) return;
      const convo = state.conversations.find((c) => c.id === conversationId);
      if (!convo) return;

      const isFirstMessage = convo.messages.length === 0;
      const localMessageId = generateId();
      dispatch({
        type: "ADD_MESSAGE",
        conversationId,
        message: {
          id: localMessageId,
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
          imageDataUrl:
            attachment?.kind === "image" ? `data:${attachment.mimeType};base64,${attachment.data}` : undefined,
          documentMeta:
            attachment?.kind === "document"
              ? {
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  // Approximated from the base64 payload — the real, exact
                  // extracted character count comes back from the server and
                  // is only known after a reload (see lib/document.ts).
                  fileSizeBytes: Math.ceil((attachment.data.length * 3) / 4),
                }
              : undefined,
          datasetMeta:
            attachment?.kind === "dataset"
              ? {
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  // Approximated from the base64 payload — the real row
                  // count comes back from the server and is only known
                  // after a reload (see lib/dataset.ts).
                  fileSizeBytes: Math.ceil((attachment.data.length * 3) / 4),
                }
              : undefined,
        },
        retitle: isFirstMessage
          ? truncate(trimmed, 38) ||
            (attachment?.kind === "document" || attachment?.kind === "dataset"
              ? attachment.filename
              : attachment
                ? "Image"
                : undefined)
          : undefined,
      });

      await postAndHandleReply(conversationId, trimmed, attachment, webSearch, deepResearch, jobFitAnalysis, localMessageId);
    },
    [state.conversations, postAndHandleReply]
  );

  const retryLastMessage = useCallback(async () => {
    if (!state.lastFailedMessage) return;
    const { conversationId, text, attachment, webSearch, deepResearch, jobFitAnalysis } = state.lastFailedMessage;
    // The failed user message is already visible (added optimistically by
    // sendMessage) — don't add it again, just re-attempt the AI reply. The
    // API route recognizes this as a retry (same trailing unanswered user
    // message) and won't insert a duplicate row.
    await postAndHandleReply(conversationId, text, attachment, webSearch, deepResearch, jobFitAnalysis);
  }, [state.lastFailedMessage, postAndHandleReply]);

  const deleteConversation = useCallback((id: string) => {
    dispatch({ type: "DELETE_CONVERSATION", id });
    apiFetch(`/api/conversations/${id}`, { method: "DELETE" }).catch((err) => {
      console.error("[chat] failed to delete conversation:", err);
    });
  }, []);

  const renameConversation = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    dispatch({ type: "RENAME_CONVERSATION", id, title: trimmed });
    apiFetch(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title: trimmed }) }).catch(
      (err) => console.error("[chat] failed to rename conversation:", err)
    );
  }, []);

  const moveConversationToProject = useCallback((id: string, projectId: string | null) => {
    dispatch({ type: "MOVE_CONVERSATION", id, projectId });
    apiFetch(`/api/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ projectId }) }).catch((err) => {
      console.error("[chat] failed to move conversation:", err);
    });
  }, []);

  const clearAllConversations = useCallback(() => {
    const ids = state.conversations.map((c) => c.id);
    dispatch({ type: "CLEAR_ALL" });
    void Promise.all(
      ids.map((id) => apiFetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => null))
    );
  }, [state.conversations]);

  const dismissError = useCallback(() => {
    dispatch({ type: "SET_STATUS", status: "idle" });
  }, []);

  const submitFeedback = useCallback(
    (conversationId: string, messageId: string, rating: FeedbackRating) => {
      const convo = conversationsRef.current.find((c) => c.id === conversationId);
      const current = convo?.messages.find((m) => m.id === messageId)?.feedback;
      // Clicking the already-active rating clears it; otherwise it sets/switches it.
      const next: FeedbackRating | null = current === rating ? null : rating;

      dispatch({ type: "SET_MESSAGE_FEEDBACK", conversationId, messageId, feedback: next });

      const request =
        next === null
          ? apiFetch(`/api/messages/${messageId}/feedback`, { method: "DELETE" })
          : apiFetch(`/api/messages/${messageId}/feedback`, {
              method: "POST",
              body: JSON.stringify({ rating: next }),
            });

      request.catch((err) => {
        console.error("[chat] failed to submit feedback:", err);
        dispatch({ type: "SET_MESSAGE_FEEDBACK", conversationId, messageId, feedback: current ?? null });
      });
    },
    []
  );

  // Shared rollback for editMessage/deleteMessage: re-fetches this one
  // conversation's messages from the server and replaces local state with
  // the authoritative version, rather than trying to surgically reconstruct
  // what the optimistic update undid (which risks re-inserting a message at
  // the wrong position or missing a concurrent change).
  const rollbackConversationMessages = useCallback(async (conversationId: string) => {
    try {
      const row = await apiFetch<RawConversation>(`/api/conversations/${conversationId}`);
      dispatch({ type: "SET_MESSAGES", conversationId, messages: mapConversation(row).messages });
    } catch (err) {
      console.error("[chat] failed to reload conversation after a failed edit/delete:", err);
    }
  }, []);

  // Tracks conversation ids currently being fetched by ensureMessagesLoaded,
  // so a fast double-invocation (e.g. React StrictMode's dev-only double
  // effect run, or quickly navigating away and back) can't fire two
  // concurrent fetches for the same conversation.
  const loadingMessagesRef = useRef<Set<string>>(new Set());

  // Reads state.conversations directly (not conversationsRef) — deliberately
  // so this closure updates in the same render/commit as the conversation
  // list itself. This is called from other components' own effects (chat
  // page, RecentConversations, dashboard) which — being descendants of this
  // provider — have their passive effects fire *before* this provider's own
  // `conversationsRef.current = state.conversations` sync effect within the
  // same commit. Reading the ref here raced that sync: on the very first
  // hydrate, the lookup saw the still-empty pre-hydrate array, silently
  // found no matching conversation, and bailed — permanently, since the
  // caller's effect dependency doesn't change again afterward. Depending on
  // state.conversations instead means this function is recreated in the
  // same commit that updates the list, so it's never stale when called.
  const ensureMessagesLoaded = useCallback(async (conversationId: string) => {
    const convo = state.conversations.find((c) => c.id === conversationId);
    if (!convo || convo.messagesLoaded || loadingMessagesRef.current.has(conversationId)) return;

    loadingMessagesRef.current.add(conversationId);
    try {
      const row = await apiFetch<RawConversation>(`/api/conversations/${conversationId}`);
      dispatch({ type: "SET_MESSAGES", conversationId, messages: mapConversation(row).messages });
    } catch (err) {
      console.error("[chat] failed to load conversation messages:", err);
      // Left as not-loaded so the chat page's loading state persists rather
      // than silently rendering an empty conversation — the page can retry
      // by calling this again (e.g. the user navigating back to it).
    } finally {
      loadingMessagesRef.current.delete(conversationId);
    }
  }, [state.conversations]);

  const searchConversations = useCallback(async (query: string): Promise<Conversation[]> => {
    const rows = await apiFetch<RawConversation[]>(`/api/conversations?q=${encodeURIComponent(query)}`);
    return rows.map(mapConversation);
  }, []);

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string) => {
      // A deleted user question can't leave its answer orphaned — mirrors
      // the server's own pairing rule (see DELETE /api/messages/[id]) so the
      // optimistic UI update matches what actually gets removed from the
      // database, without waiting for a round-trip.
      const convo = conversationsRef.current.find((c) => c.id === conversationId);
      const index = convo?.messages.findIndex((m) => m.id === messageId) ?? -1;
      const target = index >= 0 ? convo!.messages[index] : undefined;
      const next = index >= 0 ? convo!.messages[index + 1] : undefined;
      const pairedAssistantId =
        target?.role === "user" && next?.role === "assistant" ? next.id : undefined;

      const messageIds = pairedAssistantId ? [messageId, pairedAssistantId] : [messageId];
      dispatch({ type: "REMOVE_MESSAGES", conversationId, messageIds });
      try {
        await apiFetch(`/api/messages/${messageId}`, { method: "DELETE" });
      } catch (err) {
        console.error("[chat] failed to delete message:", err);
        await rollbackConversationMessages(conversationId);
        dispatch({
          type: "SET_STATUS",
          status: "error",
          error: err instanceof Error ? err.message : "Could not delete that message. Please try again.",
        });
      }
    },
    [rollbackConversationMessages]
  );

  /**
   * Edits a user message in place, discards every message that followed it
   * (this app has no branching history, so an edited question can't coexist
   * with an answer to its old wording), then regenerates a fresh reply —
   * reusing `postAndHandleReply`, the same streaming path a normal send
   * uses, since the edited message is now the conversation's unanswered
   * last message (the API route's existing retry-dedup logic recognizes
   * this and won't insert a duplicate row).
   */
  const editMessage = useCallback(
    async (conversationId: string, messageId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      dispatch({ type: "EDIT_MESSAGE_AND_TRIM", conversationId, messageId, content: trimmed });

      try {
        await apiFetch(`/api/messages/${messageId}`, {
          method: "PATCH",
          body: JSON.stringify({ content: trimmed }),
        });
      } catch (err) {
        console.error("[chat] failed to edit message:", err);
        await rollbackConversationMessages(conversationId);
        dispatch({
          type: "SET_STATUS",
          status: "error",
          error: err instanceof Error ? err.message : "Could not save your edit. Please try again.",
        });
        return;
      }

      await postAndHandleReply(conversationId, trimmed);
    },
    [rollbackConversationMessages, postAndHandleReply]
  );

  /**
   * Regenerates one assistant reply from scratch: deletes it — deleting an
   * assistant message never cascades backward to its question (see DELETE
   * /api/messages/[id]) — then resends the preceding user question through
   * the same streaming path a normal send uses. The API route recognizes
   * the now-unanswered trailing user message as a retry and generates a
   * fresh reply without inserting a duplicate row, exactly like
   * retryLastMessage/editMessage. Only ever wired up for a conversation's
   * *last* message (see MessageBubble/MessageList) — this app has no
   * branching history, so regenerating an earlier reply would leave it
   * sitting in front of messages that already responded to it.
   */
  const regenerateResponse = useCallback(
    async (conversationId: string, messageId: string) => {
      const convo = conversationsRef.current.find((c) => c.id === conversationId);
      const index = convo?.messages.findIndex((m) => m.id === messageId) ?? -1;
      if (!convo || index < 1) return;
      const target = convo.messages[index];
      const preceding = convo.messages[index - 1];
      if (target.role !== "assistant" || preceding.role !== "user") return;

      dispatch({ type: "REMOVE_MESSAGE", conversationId, messageId });

      try {
        await apiFetch(`/api/messages/${messageId}`, { method: "DELETE" });
      } catch (err) {
        console.error("[chat] failed to delete message for regeneration:", err);
        await rollbackConversationMessages(conversationId);
        dispatch({
          type: "SET_STATUS",
          status: "error",
          error: err instanceof Error ? err.message : "Could not regenerate that response. Please try again.",
        });
        return;
      }

      await postAndHandleReply(conversationId, preceding.content);
    },
    [rollbackConversationMessages, postAndHandleReply]
  );

  /**
   * Generates one image from a prompt via the dedicated (non-streaming)
   * /images endpoint. The user's prompt is added optimistically, exactly
   * like sendMessage — it stays visible even if generation fails, so
   * "Retry"/"Regenerate" can resend the same prompt. Kept entirely separate
   * from `postAndHandleReply`/`status`: image generation is a plain
   * request/response, not a token stream, and shouldn't be able to block or
   * be blocked by an unrelated ordinary chat send.
   */
  const generateImage = useCallback(
    async (conversationId: string, prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const convo = state.conversations.find((c) => c.id === conversationId);
      if (!convo) return;

      const isFirstMessage = convo.messages.length === 0;
      dispatch({
        type: "ADD_MESSAGE",
        conversationId,
        message: { id: generateId(), role: "user", content: trimmed, createdAt: new Date().toISOString() },
        retitle: isFirstMessage ? truncate(trimmed, 38) || undefined : undefined,
      });

      dispatch({ type: "SET_IMAGE_GENERATION_STATUS", generating: true, error: null });

      try {
        const assistantRow = await apiFetch<RawMessage>(`/api/conversations/${conversationId}/images`, {
          method: "POST",
          body: JSON.stringify({ prompt: trimmed }),
        });
        dispatch({ type: "ADD_MESSAGE", conversationId, message: mapMessage(assistantRow) });
        dispatch({ type: "SET_IMAGE_GENERATION_STATUS", generating: false, error: null });
      } catch (err) {
        dispatch({
          type: "SET_IMAGE_GENERATION_STATUS",
          generating: false,
          error: err instanceof Error ? err.message : "Could not generate the image. Please try again.",
        });
      }
    },
    [state.conversations]
  );

  const dismissImageGenerationError = useCallback(() => {
    dispatch({ type: "SET_IMAGE_GENERATION_STATUS", generating: false, error: null });
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations: state.conversations,
      status: state.status,
      error: state.error,
      hydrated: state.hydrated,
      imageGenerating: state.imageGenerating,
      imageGenerationError: state.imageGenerationError,
      isStreaming: state.isStreaming,
      searchingWeb: state.searchingWeb,
      getConversation,
      refreshConversations,
      ensureMessagesLoaded,
      searchConversations,
      createConversation,
      sendMessage,
      retryLastMessage,
      stopGenerating,
      deleteConversation,
      renameConversation,
      moveConversationToProject,
      clearAllConversations,
      dismissError,
      submitFeedback,
      editMessage,
      deleteMessage,
      regenerateResponse,
      generateImage,
      dismissImageGenerationError,
    }),
    [
      state.conversations,
      state.status,
      state.error,
      state.hydrated,
      state.imageGenerating,
      state.imageGenerationError,
      state.isStreaming,
      state.searchingWeb,
      getConversation,
      refreshConversations,
      ensureMessagesLoaded,
      searchConversations,
      createConversation,
      sendMessage,
      retryLastMessage,
      stopGenerating,
      deleteConversation,
      renameConversation,
      moveConversationToProject,
      clearAllConversations,
      dismissError,
      submitFeedback,
      editMessage,
      deleteMessage,
      regenerateResponse,
      generateImage,
      dismissImageGenerationError,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
