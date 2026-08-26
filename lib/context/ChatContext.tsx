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
import type { ChatStatus, Conversation, FeedbackRating, Message, Mode } from "../types";
import { generateId, truncate } from "../utils";
import { useAuth } from "./AuthContext";

interface ChatState {
  conversations: Conversation[];
  status: ChatStatus;
  error: string | null;
  lastFailedMessage: { conversationId: string; text: string } | null;
  hydrated: boolean;
}

type Action =
  | { type: "HYDRATE"; conversations: Conversation[] }
  | { type: "ADD_CONVERSATION"; conversation: Conversation }
  | { type: "ADD_MESSAGE"; conversationId: string; message: Message; retitle?: string }
  | { type: "UPDATE_MESSAGE_CONTENT"; conversationId: string; messageId: string; content: string }
  | { type: "REPLACE_MESSAGE"; conversationId: string; messageId: string; message: Message }
  | { type: "REMOVE_MESSAGE"; conversationId: string; messageId: string }
  | { type: "DELETE_CONVERSATION"; id: string }
  | { type: "CLEAR_ALL" }
  | { type: "RENAME_CONVERSATION"; id: string; title: string }
  | { type: "SET_STATUS"; status: ChatStatus; error?: string | null }
  | { type: "SET_LAST_FAILED"; value: { conversationId: string; text: string } | null }
  | { type: "SET_MESSAGE_FEEDBACK"; conversationId: string; messageId: string; feedback: FeedbackRating | null };

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
    case "REMOVE_MESSAGE":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.conversationId
            ? { ...c, messages: c.messages.filter((m) => m.id !== action.messageId) }
            : c
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
    default:
      return state;
  }
}

interface ChatContextValue {
  conversations: Conversation[];
  status: ChatStatus;
  error: string | null;
  hydrated: boolean;
  getConversation: (id: string) => Conversation | undefined;
  createConversation: (mode: Mode) => Promise<string>;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  clearAllConversations: () => void;
  dismissError: () => void;
  submitFeedback: (conversationId: string, messageId: string, rating: FeedbackRating) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

// ── Raw API shapes (snake_case, as stored in Postgres) → app types ────────

interface RawMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  message_feedback?: { rating: FeedbackRating }[];
}

interface RawConversation {
  id: string;
  mode: Mode;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: RawMessage[];
}

function mapMessage(m: RawMessage): Message {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.created_at,
    feedback: m.message_feedback?.[0]?.rating ?? null,
  };
}

function mapConversation(c: RawConversation): Conversation {
  return {
    id: c.id,
    mode: c.mode,
    title: c.title,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    messages: (c.messages ?? []).map(mapMessage),
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

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    conversations: [],
    status: "idle",
    error: null,
    lastFailedMessage: null,
    hydrated: false,
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

  const getConversation = useCallback(
    (id: string) => state.conversations.find((c) => c.id === id),
    [state.conversations]
  );

  const createConversation = useCallback(async (mode: Mode): Promise<string> => {
    const row = await apiFetch<RawConversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
    const conversation = mapConversation(row);
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
  const postAndHandleReply = useCallback(async (conversationId: string, text: string) => {
    dispatch({ type: "SET_STATUS", status: "loading" });

    const streamMessageId = generateId();
    let started = false;
    let accumulated = "";

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          if (!line) continue;

          const event = JSON.parse(line) as
            | { type: "chunk"; delta: string }
            | { type: "done"; assistantMessage: RawMessage }
            | { type: "error"; code: string; message: string };

          if (event.type === "chunk") {
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

      dispatch({ type: "SET_LAST_FAILED", value: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (started) dispatch({ type: "REMOVE_MESSAGE", conversationId, messageId: streamMessageId });
      dispatch({ type: "SET_STATUS", status: "error", error: message });
      dispatch({ type: "SET_LAST_FAILED", value: { conversationId, text } });
    }
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const convo = state.conversations.find((c) => c.id === conversationId);
      if (!convo) return;

      const isFirstMessage = convo.messages.length === 0;
      dispatch({
        type: "ADD_MESSAGE",
        conversationId,
        message: { id: generateId(), role: "user", content: trimmed, createdAt: new Date().toISOString() },
        retitle: isFirstMessage ? truncate(trimmed, 38) : undefined,
      });

      await postAndHandleReply(conversationId, trimmed);
    },
    [state.conversations, postAndHandleReply]
  );

  const retryLastMessage = useCallback(async () => {
    if (!state.lastFailedMessage) return;
    const { conversationId, text } = state.lastFailedMessage;
    // The failed user message is already visible (added optimistically by
    // sendMessage) — don't add it again, just re-attempt the AI reply. The
    // API route recognizes this as a retry (same trailing unanswered user
    // message) and won't insert a duplicate row.
    await postAndHandleReply(conversationId, text);
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

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations: state.conversations,
      status: state.status,
      error: state.error,
      hydrated: state.hydrated,
      getConversation,
      createConversation,
      sendMessage,
      retryLastMessage,
      deleteConversation,
      renameConversation,
      clearAllConversations,
      dismissError,
      submitFeedback,
    }),
    [
      state.conversations,
      state.status,
      state.error,
      state.hydrated,
      getConversation,
      createConversation,
      sendMessage,
      retryLastMessage,
      deleteConversation,
      renameConversation,
      clearAllConversations,
      dismissError,
      submitFeedback,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
