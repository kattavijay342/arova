import type { Message } from "./types";

/**
 * Shared between the mock AI (which decides what to say next) and the chat
 * UI (which renders the progress bar / results card / recent-conversations
 * meta line) so all three agree on the same state from the same message
 * history — no separate state to drift.
 */
export const INTERVIEW_QUESTIONS = [
  "Tell me about a time you had to meet a tight deadline. What did you do?",
  "Walk me through how you'd approach debugging a production issue you've never seen before.",
  "Describe a disagreement with a teammate and how you resolved it.",
  "Tell me about a project you're proud of and your specific contribution to it.",
  "How do you prioritize when you have multiple urgent tasks at once?",
  "Tell me about a time you had to learn something new quickly.",
  "Describe a mistake you made at work and what you learned from it.",
  "How do you handle feedback or criticism on your work?",
  "Tell me about a time you had to convince someone to see things your way.",
  "Where do you see yourself in this role a year from now?",
];

const QUESTION_MARKER = "Mock interview — Question";
const SCORE_MARKER = "Interview Complete";

export function getInterviewStep(history: Message[]): number {
  return history.filter((m) => m.role === "assistant" && m.content.includes(QUESTION_MARKER)).length;
}

export interface InterviewState {
  currentQuestion: number;
  total: number;
  complete: boolean;
  role: string;
}

/** Returns null when this conversation isn't (yet) a mock interview. */
export function getInterviewState(messages: Message[]): InterviewState | null {
  const questionCount = getInterviewStep(messages);
  if (questionCount === 0) return null;

  const complete = messages.some((m) => m.role === "assistant" && m.content.includes(SCORE_MARKER));
  const trigger = messages.find((m) => m.role === "user" && /interview/i.test(m.content));

  return {
    currentQuestion: Math.min(questionCount, INTERVIEW_QUESTIONS.length),
    total: INTERVIEW_QUESTIONS.length,
    complete,
    role: trigger ? extractRole(trigger.content) : "General",
  };
}

/** "Start a mock interview for a frontend developer role" -> "Frontend Developer" */
export function extractRole(triggerMessage: string): string {
  const match = triggerMessage.match(/for\s+(?:a\s+|an\s+)?(.+?)(?:\s+role)?[.!?]?$/i);
  const raw = match?.[1]?.trim();
  if (!raw) return "General";
  return raw
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export interface ScoreCategory {
  name: string;
  score: number;
}

export interface ScoreData {
  overall: number;
  categories: ScoreCategory[];
  wellDone: string[];
  improve: string[];
}

/**
 * Reconstructs the structured score data from a completed interview's final
 * message so the UI can render a proper results card instead of raw
 * markdown. Scoped to the text from SCORE_MARKER onward so it never picks
 * up the per-answer "Quick feedback" bullets that precede it in the same
 * message.
 */
export function parseScoreCard(content: string): ScoreData | null {
  const idx = content.indexOf(SCORE_MARKER);
  if (idx === -1) return null;
  const section = content.slice(idx);

  const overallMatch = section.match(/##\s*(\d+)\s*\/\s*100/);
  if (!overallMatch) return null;
  const overall = Number(overallMatch[1]);

  const categories: ScoreCategory[] = [];
  const tableRowRegex = /\|\s*([A-Za-z][A-Za-z ]*?)\s*\|\s*(\d+)\s*\|/g;
  let match: RegExpExecArray | null;
  while ((match = tableRowRegex.exec(section))) {
    categories.push({ name: match[1].trim(), score: Number(match[2]) });
  }

  const wellDone = [...section.matchAll(/^-\s*✅\s*(.+)$/gm)].map((m) => m[1].trim());
  const improve = [...section.matchAll(/^-\s*⚠️\s*(.+)$/gm)].map((m) => m[1].trim());

  return { overall, categories, wellDone, improve };
}

/** Score out of 100 from a completed interview's last message, or null if not completed. */
export function extractScore(messages: Message[]): number | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.includes(SCORE_MARKER)) {
      return parseScoreCard(m.content)?.overall ?? null;
    }
  }
  return null;
}
