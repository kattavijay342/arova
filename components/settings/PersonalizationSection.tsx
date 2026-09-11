"use client";

import { useState, type FormEvent } from "react";
import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";

const MAX_LENGTH = 1500;

/**
 * Global custom instructions — "what should Arova know about you" / "how
 * should it respond" — applied to every conversation, in every mode,
 * unlike a project's own instructions (scoped to just that project, see
 * app/(app)/projects/[projectId]/page.tsx) or Memory (a list of discrete
 * facts rather than free-text style/context, see MemorySection).
 */
export function PersonalizationSection() {
  const { user, updateProfile } = useAuth();
  const [about, setAbout] = useState(user?.customInstructionsAbout ?? "");
  const [style, setStyle] = useState(user?.customInstructionsStyle ?? "");
  const [saved, setSaved] = useState(false);

  const disabled = Boolean(user?.isGuest);
  const unchanged = about === (user?.customInstructionsAbout ?? "") && style === (user?.customInstructionsStyle ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (unchanged) return;
    updateProfile({ customInstructionsAbout: about.trim(), customInstructionsStyle: style.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 flex-none text-faint" aria-hidden />
        <div>
          <h2 className="font-display text-lg font-semibold text-text">Personalization</h2>
          <p className="text-[15px] text-muted">
            Applied to every conversation, in every mode — separate from Memory (facts) and a project&apos;s own
            instructions (scoped to just that project).
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="personalization-about" className="text-sm font-semibold text-text">
            What should Arova know about you?
          </label>
          <textarea
            id="personalization-about"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            disabled={disabled}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder="e.g. I'm a second-year computer science student focused on web development."
            className="w-full resize-y rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
          <p className="text-right text-[12px] text-faint">{about.length}/{MAX_LENGTH}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="personalization-style" className="text-sm font-semibold text-text">
            How should Arova respond?
          </label>
          <textarea
            id="personalization-style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={disabled}
            maxLength={MAX_LENGTH}
            rows={3}
            placeholder="e.g. Keep answers concise and code-first. Skip long preambles."
            className="w-full resize-y rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          />
          <p className="text-right text-[12px] text-faint">{style.length}/{MAX_LENGTH}</p>
        </div>

        {!disabled && (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={unchanged}>
              Save changes
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm font-medium text-general">
                <Check className="h-4 w-4" aria-hidden />
                Saved
              </span>
            )}
          </div>
        )}
        {disabled && (
          <p className="text-[15px] text-faint">Create an account to save personalization preferences.</p>
        )}
      </form>
    </Card>
  );
}
