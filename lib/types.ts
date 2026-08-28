export type Mode = "student" | "career" | "general";

export interface User {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
}

export type MessageRole = "user" | "assistant";

export type FeedbackRating = "up" | "down";

// Base64 image data (no "data:mime;base64," prefix) sent with a single chat
// message for Gemini multimodal input. Never persisted — only carried on the
// live request/response for the turn it was sent in.
export interface ImageAttachment {
  mimeType: string;
  data: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  feedback?: FeedbackRating | null;
  // Client-side only, for rendering the just-sent image in the user's own
  // bubble. Not persisted — absent after a reload since attachments aren't
  // saved to the database.
  imageDataUrl?: string;
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
