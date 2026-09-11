import type { Message } from "./types";

/**
 * Mirrors lib/interview.ts's design for the mock interview flow: the AI is
 * instructed (see SYSTEM_INSTRUCTIONS.student) to format a practice quiz
 * with these exact markers, and everything here just re-parses that
 * structure back out of the conversation's own message history — no
 * separate state to drift, same as the interview flow.
 */
export const QUIZ_TOTAL_QUESTIONS = 5;

const QUESTION_MARKER = "Practice quiz — Question";
const SCORE_MARKER = "Quiz Complete";
const SUBJECT_LINE_RE = /\*\*Subject:\*\*\s*(.+)/;

export function getQuizStep(history: Message[]): number {
  return history.filter((m) => m.role === "assistant" && m.content.includes(QUESTION_MARKER)).length;
}

export interface QuizState {
  currentQuestion: number;
  total: number;
  complete: boolean;
  subject: string;
}

/** Returns null when this conversation isn't (yet) a practice quiz. */
export function getQuizState(messages: Message[]): QuizState | null {
  const questionCount = getQuizStep(messages);
  if (questionCount === 0) return null;

  const complete = messages.some((m) => m.role === "assistant" && m.content.includes(SCORE_MARKER));

  // The subject is stated by the AI itself (in the first question and again
  // in the final score message) rather than guessed from the user's
  // trigger phrasing — quiz requests are far too varied in wording
  // ("quiz me on X", "test me on Y", "practice questions about Z") for a
  // regex to reliably extract a clean topic the way the interview flow's
  // extractRole can from its much more constrained "for a <role> role"
  // trigger phrasing.
  const firstQuestion = messages.find((m) => m.role === "assistant" && m.content.includes(QUESTION_MARKER));
  const subject = firstQuestion?.content.match(SUBJECT_LINE_RE)?.[1]?.trim() || "General";

  return {
    currentQuestion: Math.min(questionCount, QUIZ_TOTAL_QUESTIONS),
    total: QUIZ_TOTAL_QUESTIONS,
    complete,
    subject,
  };
}

export interface QuizReviewItem {
  correct: boolean;
  label: string;
}

export interface QuizScoreData {
  score: number;
  total: number;
  subject: string;
  review: QuizReviewItem[];
  tip: string | null;
}

/**
 * Reconstructs the structured quiz result from a completed quiz's final
 * message, the same way lib/interview.ts's parseScoreCard does for a mock
 * interview — so the UI can render a proper results card instead of raw
 * markdown.
 */
export function parseQuizScoreCard(content: string): QuizScoreData | null {
  const idx = content.indexOf(SCORE_MARKER);
  if (idx === -1) return null;
  const section = content.slice(idx);

  const scoreMatch = section.match(/##\s*(\d+)\s*\/\s*(\d+)/);
  if (!scoreMatch) return null;
  const score = Number(scoreMatch[1]);
  const total = Number(scoreMatch[2]);

  const subject = section.match(SUBJECT_LINE_RE)?.[1]?.trim() || "General";

  const review: QuizReviewItem[] = [
    ...[...section.matchAll(/^-\s*✅\s*(.+)$/gm)].map((m) => ({ correct: true, label: m[1].trim() })),
    ...[...section.matchAll(/^-\s*❌\s*(.+)$/gm)].map((m) => ({ correct: false, label: m[1].trim() })),
  ];

  const tipMatch = section.match(/\*\*Tip for next time\*\*\s*\n+([^\n]+)/);
  const tip = tipMatch ? tipMatch[1].trim() : null;

  return { score, total, subject, review, tip };
}

/** Score for a completed quiz from its last message, or null if not completed. */
export function extractQuizScore(messages: Message[]): { score: number; total: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.includes(SCORE_MARKER)) {
      const parsed = parseQuizScoreCard(m.content);
      return parsed ? { score: parsed.score, total: parsed.total } : null;
    }
  }
  return null;
}

export interface CompletedQuizSummary {
  subject: string;
  score: number;
  total: number;
  /** Timestamp of the message that declared the quiz complete. */
  completedAt: string;
}

/**
 * Returns null unless this conversation is a *finished* practice quiz with a
 * real parsed score — used both for cross-conversation study-progress
 * tracking (see components/dashboard/StudyProgressSummary.tsx) and for
 * building the adaptive quiz-history context fed back into the AI (see
 * lib/server/studyProgress.ts), mirroring
 * lib/interview.ts's getCompletedInterviewSummary.
 */
export function getCompletedQuizSummary(messages: Message[]): CompletedQuizSummary | null {
  const state = getQuizState(messages);
  if (!state || !state.complete) return null;

  const scoreMessage = [...messages].reverse().find((m) => m.role === "assistant" && m.content.includes(SCORE_MARKER));
  if (!scoreMessage) return null;

  const parsed = parseQuizScoreCard(scoreMessage.content);
  if (!parsed) return null;

  return { subject: parsed.subject, score: parsed.score, total: parsed.total, completedAt: scoreMessage.createdAt };
}
