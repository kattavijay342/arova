import { getSessionUser } from "./requireUser";

/**
 * Builds the custom-instructions context appended to the system instruction
 * for one AI call (see lib/server/gemini.ts), or null if the user hasn't
 * set either field. Mirrors lib/server/memory.ts's getMemoryContext, but for
 * the two global style/context preferences on `profiles` (see
 * components/settings/PersonalizationSection.tsx) rather than a list of
 * discrete facts — always read fresh so an edit takes effect immediately.
 */
export async function getCustomInstructions(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase!
    .from("profiles")
    .select("custom_instructions_about, custom_instructions_style")
    .eq("id", userId)
    .maybeSingle();

  const about = profile?.custom_instructions_about?.trim();
  const style = profile?.custom_instructions_style?.trim();
  if (!about && !style) return null;

  const parts: string[] = [];
  if (about) parts.push(`About the user:\n${about}`);
  if (style) parts.push(`How the user wants replies:\n${style}`);
  return parts.join("\n\n");
}
