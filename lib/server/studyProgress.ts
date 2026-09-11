import { getSessionUser } from "./requireUser";
import { getCompletedQuizSummary, type CompletedQuizSummary } from "@/lib/quiz";
import type { Message } from "@/lib/types";

// Bounded to the most recently updated student-mode conversations rather
// than all of them — a user can accumulate far more Student mode
// conversations over time than Career mode ones (daily studying vs.
// occasional interview prep), so joining every one's full message history
// on every single Student mode turn would reintroduce the same "load
// everything eagerly" cost Phase 1/2 removed from the conversation list
// itself. This is the same bounded-fetch trade-off RecentConversations and
// CareerProgressSummary already make.
const MAX_RECENT_STUDENT_CONVERSATIONS = 15;
const MAX_SUBJECTS_IN_CONTEXT = 8;

interface RawMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/**
 * Builds the quiz-history context appended to the Student mode system
 * instruction (see lib/server/gemini.ts), or null if the student hasn't
 * completed any practice quiz yet. Mirrors lib/server/memory.ts's
 * getMemoryContext — read fresh on every Student mode turn rather than
 * cached, so a quiz completed moments ago is already reflected in the very
 * next message.
 */
export async function getStudyProgressContext(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  userId: string
): Promise<string | null> {
  const { data: conversations } = await supabase!
    .from("conversations")
    .select("id, messages(id, role, content, created_at)")
    .eq("user_id", userId)
    .eq("mode", "student")
    .order("updated_at", { ascending: false })
    .limit(MAX_RECENT_STUDENT_CONVERSATIONS);

  if (!conversations || conversations.length === 0) return null;

  const completed = (conversations as { messages: RawMessageRow[] }[])
    .map((c) => {
      const messages: Message[] = (c.messages ?? [])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at }));
      return getCompletedQuizSummary(messages);
    })
    .filter((s): s is CompletedQuizSummary => s !== null)
    .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1));

  if (completed.length === 0) return null;

  // Most recent attempt per subject wins — a repeat quiz on the same topic
  // should reflect the student's latest standing there, not blend in an
  // attempt from weeks earlier.
  const bySubject = new Map<string, CompletedQuizSummary>();
  for (const entry of completed) {
    if (!bySubject.has(entry.subject)) bySubject.set(entry.subject, entry);
  }

  const lines = [...bySubject.values()]
    .slice(0, MAX_SUBJECTS_IN_CONTEXT)
    .map((e) => `- ${e.subject}: ${e.score}/${e.total}`);

  return lines.join("\n");
}
