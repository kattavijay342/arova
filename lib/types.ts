export type Mode = "student" | "career" | "general";

export interface User {
  id: string;
  name: string;
  email: string;
  isGuest: boolean;
  // Whether saved memories are used/collected at all. Off doesn't delete
  // existing memories — it just pauses them (see components/settings/MemorySection.tsx).
  memoryEnabled: boolean;
  // Global custom instructions (see components/settings/PersonalizationSection.tsx)
  // — applied to every conversation, in every mode, unlike a project's own
  // instructions which only apply inside that project. Empty string means unset.
  customInstructionsAbout: string;
  customInstructionsStyle: string;
}

// A short, user-saved fact (never AI-extracted) given to the assistant as
// context on every message, across every conversation and mode.
export interface UserMemory {
  id: string;
  content: string;
  createdAt: string;
}

export type MessageRole = "user" | "assistant";

export type FeedbackRating = "up" | "down";

// Base64 image data (no "data:mime;base64," prefix) sent with a single chat
// message for Gemini multimodal input. Never persisted — only carried on the
// live request/response for the turn it was sent in.
export interface ImageAttachment {
  kind: "image";
  mimeType: string;
  data: string;
}

// Base64 document data (PDF/DOCX/TXT/MD) sent with a single chat message.
// Unlike images, the server extracts its text and embeds it into the
// persisted message content (see lib/document.ts) — so, unlike images, a
// document's content *does* remain available on later turns in the same
// conversation.
export interface DocumentAttachment {
  kind: "document";
  mimeType: string;
  data: string;
  filename: string;
}

// Base64 CSV data sent with a single chat message. Handled like a document —
// its text is extracted and embedded into the persisted message content
// (see lib/dataset.ts) — but kept as a distinct attachment kind because it's
// also the signal the server uses to enable Gemini's code execution tool for
// this conversation, which a generic document attachment never does.
export interface DatasetAttachment {
  kind: "dataset";
  mimeType: string;
  data: string;
  filename: string;
}

export type MessageAttachment = ImageAttachment | DocumentAttachment | DatasetAttachment;

// Client-only metadata for the file chip shown on a message that had a
// document attached — reconstructed from the persisted `[[document: ...]]`
// marker in `content` after a reload (see lib/document.ts), or set directly
// from the just-sent attachment for the current session.
export interface DocumentAttachmentMeta {
  filename: string;
  mimeType: string;
  // Known once the server has extracted the file's text (i.e. after a
  // reload, reconstructed from the persisted marker). Absent for the
  // client-only optimistic version shown right after sending, which shows
  // `fileSizeBytes` instead since that's all the browser knows up front.
  charCount?: number;
  truncated?: boolean;
  fileSizeBytes?: number;
}

// Same idea as DocumentAttachmentMeta, for a `[[dataset: ...]]` marker (see lib/dataset.ts).
export interface DatasetAttachmentMeta {
  filename: string;
  mimeType: string;
  rowCount?: number;
  truncated?: boolean;
  fileSizeBytes?: number;
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
  // Client-only convenience for the current session — set directly from the
  // just-sent attachment so the file chip renders immediately. Absent after
  // a reload; MessageBubble falls back to parsing the persisted
  // `[[document: ...]]` marker out of `content` in that case (see lib/document.ts).
  documentMeta?: DocumentAttachmentMeta;
  // Same idea as documentMeta, for a dataset (CSV) attachment (see lib/dataset.ts).
  datasetMeta?: DatasetAttachmentMeta;
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
  // Optional — a conversation with no project keeps working exactly as
  // before. See lib/context/ProjectContext.tsx.
  projectId?: string | null;
}

export type ChatStatus = "idle" | "loading" | "error";

// A mode-agnostic container grouping conversations together, with its own
// custom instructions and reference files — both given to the AI as extra
// context for every conversation inside it (see lib/server/project.ts).
export interface Project {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  filename: string;
  mimeType: string;
  charCount: number;
  truncated: boolean;
  createdAt: string;
}
