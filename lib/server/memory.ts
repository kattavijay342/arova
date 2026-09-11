import { getSessionUser } from "./requireUser";

// Defensive cap on the total text injected into every single message's
// system instruction — a user could in principle save up to 100 memories at
// 500 chars each (see app/api/memories/route.ts), which is more context
// than should be spent on every turn regardless. Most-recent memories win.
const MAX_MEMORY_CONTEXT_CHARS = 3000;

/**
 * Builds the memory context string appended to the system instruction for
 * one AI call (see lib/server/gemini.ts), or null if the user has memory
 * turned off or hasn't saved anything. Reads `profiles.memory_enabled`
 * fresh on every call rather than trusting a client-supplied flag, so
 * turning memory off takes effect immediately everywhere.
 */
export async function getMemoryContext(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase!.from("profiles").select("memory_enabled").eq("id", userId).maybeSingle();
  if (profile?.memory_enabled === false) return null;

  const { data: memories } = await supabase!
    .from("user_memories")
    .select("content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!memories || memories.length === 0) return null;

  let context = "";
  for (const { content } of memories as { content: string }[]) {
    const line = `- ${content}`;
    if (context.length + line.length + 1 > MAX_MEMORY_CONTEXT_CHARS) break;
    context += (context ? "\n" : "") + line;
  }
  return context || null;
}
