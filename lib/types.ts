export type Mode = "student" | "career" | "general";

export interface User {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
}

export type MessageRole = "user" | "assistant";

export type FeedbackRating = "up" | "down";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  feedback?: FeedbackRating | null;
}

export interface UsageStats {
  conversationCount: number;
  messageCount: number;
  lastActiveAt: string | null;
  memberSince: string;
}

export interface Conversation {
  id: string;
  mode: Mode;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export type ChatStatus = "idle" | "loading" | "error";
