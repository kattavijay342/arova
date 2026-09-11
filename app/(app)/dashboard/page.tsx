"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlayCircle, GraduationCap, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { useChat } from "@/lib/context/ChatContext";
import { MODE_LIST, MODES } from "@/lib/modes";
import { getInterviewState } from "@/lib/interview";
import { ModeCard } from "@/components/dashboard/ModeCard";
import { RecentConversations } from "@/components/dashboard/RecentConversations";
import { CareerProgressSummary } from "@/components/dashboard/CareerProgressSummary";
import { StudyProgressSummary } from "@/components/dashboard/StudyProgressSummary";
import { HeroIllustration } from "@/components/dashboard/HeroIllustration";

// Bounded to the most recently updated conversations rather than a user's
// entire history — a student can accumulate far more Student mode
// conversations over time than a Career mode user accumulates interviews,
// so this mirrors the same bound lib/server/studyProgress.ts uses
// server-side for the adaptive quiz-history context.
const MAX_RECENT_STUDENT_CONVERSATIONS = 15;

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { conversations, createConversation, ensureMessagesLoaded } = useChat();

  const careerConversationIds = conversations
    .filter((c) => c.mode === "career")
    .map((c) => c.id)
    .join(",");

  // The "Continue your interview" banner needs real messages to detect an
  // in-progress interview, but the conversation list is hydrated lightweight
  // (see Conversation.messagesLoaded). Scoped to career-mode conversations
  // only, so this doesn't reintroduce the "every conversation's full history
  // on every page load" cost that was split out (see
  // lib/context/ChatContext.tsx / app/api/conversations/route.ts).
  useEffect(() => {
    for (const id of careerConversationIds ? careerConversationIds.split(",") : []) {
      void ensureMessagesLoaded(id);
    }
  }, [careerConversationIds, ensureMessagesLoaded]);

  const recentStudentConversationIds = [...conversations]
    .filter((c) => c.mode === "student")
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, MAX_RECENT_STUDENT_CONVERSATIONS)
    .map((c) => c.id)
    .join(",");

  // Same idea as the career-mode effect above, for the Student mode "Study
  // progress" section — bounded to the most recent conversations (see the
  // constant above) rather than every one, since Student mode conversations
  // tend to be far more numerous.
  useEffect(() => {
    for (const id of recentStudentConversationIds ? recentStudentConversationIds.split(",") : []) {
      void ensureMessagesLoaded(id);
    }
  }, [recentStudentConversationIds, ensureMessagesLoaded]);

  const inProgress = conversations
    .filter((c) => c.mode === "career")
    .map((c) => ({ conversation: c, state: getInterviewState(c.messages) }))
    .find((entry) => entry.state && !entry.state.complete);

  async function quickStart(modeId: "student" | "general") {
    const id = await createConversation(modeId);
    router.push(`/chat/${id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="relative flex items-center justify-between gap-6 overflow-hidden rounded-2xl border border-border bg-surface p-7 sm:p-9">
        <div className="max-w-md">
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-brand">
            Welcome back 👋
          </p>
          <h1 className="mt-2 text-balance font-display text-3xl font-semibold leading-tight text-text sm:text-[2.25rem]">
            What would you like to work on today?
          </h1>
          <p className="mt-3 text-[15px] text-muted">
            {user?.name?.split(" ")[0] ?? "Welcome"} — pick up where you left off, or start something new.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {inProgress && (
              <Link
                href={`/chat/${inProgress.conversation.id}`}
                className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03]"
                style={{ backgroundColor: MODES.career.colorSoft, color: MODES.career.color }}
              >
                <PlayCircle className="h-3.5 w-3.5" aria-hidden />
                Continue your interview
              </Link>
            )}
            <button
              onClick={() => quickStart("student")}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: MODES.student.colorSoft, color: MODES.student.color }}
            >
              <GraduationCap className="h-3.5 w-3.5" aria-hidden />
              Study something new
            </button>
            <button
              onClick={() => quickStart("general")}
              className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.03]"
              style={{ backgroundColor: MODES.general.colorSoft, color: MODES.general.color }}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Start a conversation
            </button>
          </div>
        </div>
        <HeroIllustration />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {MODE_LIST.map((mode) => (
          <ModeCard key={mode.id} mode={mode} />
        ))}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Recent conversations</h2>
        <RecentConversations />
      </div>

      <CareerProgressSummary conversations={conversations} />
      <StudyProgressSummary conversations={conversations} />
    </div>
  );
}
