export type CareerResponseKind = "resume" | "roadmap" | "general";

const RESUME_SIGNALS = ["resume", "cv ", " cv.", "cover letter"];
const ROADMAP_SIGNALS = ["roadmap", "skill gap", "skills to learn", "learning path", "career path", "skill map"];

/**
 * Best-effort classification of a non-interview Career Mode response, used
 * only to choose which branded "Export ... PDF" button/label to show below
 * it. There's no structured marker for these two (unlike the mock interview
 * flow, which has explicit markers the UI parses) — every Career Mode
 * response is exportable regardless of this guess; it only changes the
 * button's label, PDF header text, and filename.
 */
export function resolveCareerExportKind(content: string): CareerResponseKind {
  const lower = content.toLowerCase();
  const hasResume = RESUME_SIGNALS.some((s) => lower.includes(s));
  const hasRoadmap = ROADMAP_SIGNALS.some((s) => lower.includes(s));
  if (hasResume && !hasRoadmap) return "resume";
  if (hasRoadmap && !hasResume) return "roadmap";
  return "general";
}

const JOB_FIT_MARKER = "Job Fit Analysis";

export interface JobFitData {
  matchPercent: number;
  matchingSkills: string[];
  skillGaps: string[];
  suggestedEdits: string[];
}

/**
 * Reconstructs the structured job-fit data from a response's content, the
 * same way lib/interview.ts's parseScoreCard reconstructs a completed
 * interview's score — the AI is instructed (see lib/server/gemini.ts's
 * JOB_FIT_INSTRUCTION) to always use this exact heading/marker format.
 */
export function parseJobFitAnalysis(content: string): JobFitData | null {
  const idx = content.indexOf(JOB_FIT_MARKER);
  if (idx === -1) return null;
  const section = content.slice(idx);

  const matchMatch = section.match(/##\s*(\d+)%\s*Match/i);
  if (!matchMatch) return null;
  const matchPercent = Number(matchMatch[1]);

  const matchingSkills = [...section.matchAll(/^-\s*✅\s*(.+)$/gm)].map((m) => m[1].trim());
  const skillGaps = [...section.matchAll(/^-\s*⚠️\s*(.+)$/gm)].map((m) => m[1].trim());
  const suggestedEdits = [...section.matchAll(/^-\s*✏️\s*(.+)$/gm)].map((m) => m[1].trim());

  return { matchPercent, matchingSkills, skillGaps, suggestedEdits };
}
