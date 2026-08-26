import {
  GraduationCap,
  Briefcase,
  Sparkles,
  BookOpen,
  Bug,
  NotebookText,
  ClipboardList,
  Mic,
  FileText,
  MessagesSquare,
  TrendingUp,
  HelpCircle,
  PenLine,
  Lightbulb,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { Mode } from "./types";

export interface QuickAction {
  icon: LucideIcon;
  label: string;
  subtitle: string;
  prompt: string;
}

export interface ModeConfig {
  id: Mode;
  label: string;
  shortLabel: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  color: string;
  colorSoft: string;
  textClass: string;
  bgSoftClass: string;
  borderClass: string;
  ringClass: string;
  greeting: string;
  /** Short, punchy question shown as the empty-chat heading, e.g. "What would you like to learn?". */
  starterQuestion: string;
  /** Punchy hero-style headline used on the dashboard's mode card. */
  valueProp: string;
  /** Call to action shown on the mode card, e.g. "Start Interview". Rendered with a trailing arrow. */
  ctaLabel: string;
  /** Label shown above assistant messages in this mode, e.g. "Career Assistant". */
  assistantLabel: string;
  /** Short scannable feature tags shown on the landing page's mode cards. */
  features: string[];
  /** Three-word summary shown on the new-chat mode picker, e.g. "Study • Learn • Practice". */
  quickTags: string;
  /** Structured quick-action cards shown in the empty-chat state. */
  quickActions: QuickAction[];
  /** Marks the mode as the product's headline differentiator (gets a "Popular" tag on the dashboard). */
  featured?: boolean;
}

export const MODES: Record<Mode, ModeConfig> = {
  student: {
    id: "student",
    label: "Student Mode",
    shortLabel: "Student",
    tagline: "Study help & explanations",
    description:
      "Subject explanations, coding doubts, and practice quizzes tailored to your level.",
    icon: GraduationCap,
    color: "var(--color-student)",
    colorSoft: "var(--color-student-soft)",
    textClass: "text-student",
    bgSoftClass: "bg-student-soft",
    borderClass: "border-student",
    ringClass: "ring-student",
    greeting: "What are you studying today? Ask a doubt, or request a quiz on a topic.",
    starterQuestion: "What would you like to learn?",
    valueProp: "Study smarter, not harder.",
    ctaLabel: "Start Learning",
    assistantLabel: "Student Assistant",
    features: ["Notes", "Explanations", "Coding", "Homework"],
    quickTags: "Study • Learn • Practice",
    quickActions: [
      {
        icon: BookOpen,
        label: "Explain a Concept",
        subtitle: "Any subject, any level",
        prompt: "Can you explain a concept to me, step by step?",
      },
      {
        icon: Bug,
        label: "Debug My Code",
        subtitle: "Step-by-step help",
        prompt: "I have a bug in my code — can you help me debug it?",
      },
      {
        icon: NotebookText,
        label: "Summarize Notes",
        subtitle: "Turn a topic into short notes",
        prompt: "Can you help me summarize a topic into short notes?",
      },
      {
        icon: ClipboardList,
        label: "Exam Prep",
        subtitle: "Practice quiz questions",
        prompt: "Quiz me to help me prepare for an exam",
      },
    ],
  },
  career: {
    id: "career",
    label: "Career Mode",
    shortLabel: "Career",
    tagline: "Interview prep & resume help",
    description:
      "Mock interviews, resume feedback, and structured career guidance.",
    icon: Briefcase,
    color: "var(--color-career)",
    colorSoft: "var(--color-career-soft)",
    textClass: "text-career",
    bgSoftClass: "bg-career-soft",
    borderClass: "border-career",
    ringClass: "ring-career",
    greeting: "Let's get you interview-ready. Start a mock interview, or paste your resume for feedback.",
    starterQuestion: "What would you like to practice?",
    valueProp: "Practice smarter. Interview better.",
    ctaLabel: "Start Interview",
    assistantLabel: "Career Assistant",
    features: ["Mock Interviews", "Resume", "Feedback"],
    quickTags: "Interview • Resume • Career",
    featured: true,
    quickActions: [
      {
        icon: Mic,
        label: "Mock Interview",
        subtitle: "Technical, HR & behavioral",
        prompt: "Start a mock interview for a frontend developer role",
      },
      {
        icon: FileText,
        label: "Resume Review",
        subtitle: "ATS + recruiter feedback",
        prompt: "Can you give me feedback on my resume?",
      },
      {
        icon: MessagesSquare,
        label: "Interview Questions",
        subtitle: "Practice common questions",
        prompt: "How do I answer \"tell me about yourself\"?",
      },
      {
        icon: TrendingUp,
        label: "Career Guidance",
        subtitle: "Skills, roles & roadmap",
        prompt: "What skills should I learn for a data analyst role?",
      },
    ],
  },
  general: {
    id: "general",
    label: "General Mode",
    shortLabel: "General",
    tagline: "Everyday questions & help",
    description: "Open-ended questions, explanations, and everyday writing help.",
    icon: Sparkles,
    color: "var(--color-general)",
    colorSoft: "var(--color-general-soft)",
    textClass: "text-general",
    bgSoftClass: "bg-general-soft",
    borderClass: "border-general",
    ringClass: "ring-general",
    greeting: "Ask me anything — explanations, writing help, planning, or just a quick question.",
    starterQuestion: "What can I help with today?",
    valueProp: "Get answers, fast.",
    ctaLabel: "Start Chatting",
    assistantLabel: "General Assistant",
    features: ["Questions", "Ideas", "Research", "Writing"],
    quickTags: "Ask • Create • Explore",
    quickActions: [
      {
        icon: HelpCircle,
        label: "Ask a Question",
        subtitle: "Quick answers, explained",
        prompt: "I have a question — can you help?",
      },
      {
        icon: PenLine,
        label: "Writing Help",
        subtitle: "Emails, drafts & edits",
        prompt: "Can you help me write something?",
      },
      {
        icon: Lightbulb,
        label: "Explore an Idea",
        subtitle: "Think it through together",
        prompt: "I want to think through an idea — can you help me explore it?",
      },
      {
        icon: Search,
        label: "Quick Research",
        subtitle: "Summaries on demand",
        prompt: "Can you help me research a topic quickly?",
      },
    ],
  },
};

export const MODE_LIST: ModeConfig[] = [MODES.student, MODES.career, MODES.general];

/** Static per-mode hover glow classes — kept as literal strings so Tailwind's scanner can find them. */
export const MODE_GLOW_CLASS: Record<Mode, string> = {
  student: "hover:shadow-[0_0_0_1px_var(--color-student),0_18px_36px_-14px_var(--color-student)]",
  career: "hover:shadow-[0_0_0_1px_var(--color-career),0_18px_36px_-14px_var(--color-career)]",
  general: "hover:shadow-[0_0_0_1px_var(--color-general),0_18px_36px_-14px_var(--color-general)]",
};
