"use client";

import { CheckCircle2, AlertTriangle, PenLine, Target } from "lucide-react";
import type { JobFitData } from "@/lib/career";
import { MODES } from "@/lib/modes";

/** Renders a structured resume-vs-job-description match report — see lib/career.ts's parseJobFitAnalysis. */
export function JobFitAnalysisCard({ data }: { data: JobFitData }) {
  const career = MODES.career;

  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-surface-raised p-6 shadow-soft">
      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-text">
        <Target className="h-4 w-4 flex-none" style={{ color: career.color }} aria-hidden />
        Job Fit Analysis
      </div>

      <div className="mt-4 flex items-center gap-4">
        <div
          className="flex h-20 w-20 flex-none items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{ backgroundColor: career.color }}
        >
          {data.matchPercent}%
        </div>
        <div>
          <p className="text-2xl font-bold text-text">{data.matchPercent}%</p>
          <p className="text-[13px] text-muted">Estimated match</p>
        </div>
      </div>

      {data.matchingSkills.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[13px] font-semibold text-text">Matching skills</p>
          <ul className="flex flex-col gap-1">
            {data.matchingSkills.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[13px] text-muted">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-none text-general" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.skillGaps.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-semibold text-text">Skill gaps</p>
          <ul className="flex flex-col gap-1">
            {data.skillGaps.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[13px] text-muted">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-career" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.suggestedEdits.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[13px] font-semibold text-text">Suggested resume edits</p>
          <ul className="flex flex-col gap-1">
            {data.suggestedEdits.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-[13px] text-muted">
                <PenLine className="mt-0.5 h-3.5 w-3.5 flex-none text-faint" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 border-t border-border-soft pt-3 text-center text-[13px] text-faint">
        AI-estimated fit based on what you shared — always verify against the actual posting.
      </p>
    </div>
  );
}
