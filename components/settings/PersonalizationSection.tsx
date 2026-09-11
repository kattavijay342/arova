"use client";

import { useState, type FormEvent } from "react";
import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";

const MAX_LENGTH = 1500;
const SAVE_ERROR_MESSAGE = "Could not save your changes. Please try again.";

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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = Boolean(user?.isGuest);
  // Compared against the *trimmed* draft — otherwise saving " some text "
  // leaves the Save button permanently re-enabled afterward: the stored
  // value comes back trimmed, but the untrimmed draft here never would,
  // making a successful save look unsaved again for the rest of the session.
  const trimmedAbout = about.trim();
  const trimmedStyle = style.trim();
  const unchanged =
    trimmedAbout === (user?.customInstructionsAbout ?? "") && trimmedStyle === (user?.customInstructionsStyle ?? "");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (unchanged || saving) return;
    setSaving(true);
    setError(null);
    const ok = await updateProfile({ customInstructionsAbout: trimmedAbout, customInstructionsStyle: trimmedStyle });
    setSaving(false);
    if (ok) {
      // Reflect exactly what was persisted, not the untrimmed draft — see
      // the `unchanged` comment above.
      setAbout(trimmedAbout);
      setStyle(trimmedStyle);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(SAVE_ERROR_MESSAGE);
    }
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
            <Button type="submit" disabled={unchanged || saving} loading={saving}>
              Save changes
            </Button>
            {saved && (
              <span className="flex items-center gap-1 text-sm font-medium text-general">
                <Check className="h-4 w-4" aria-hidden />
                Saved
              </span>
            )}
            {error && (
              <span role="alert" className="text-sm text-danger">
                {error}
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
