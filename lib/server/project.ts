import { getSessionUser } from "./requireUser";

// Defensive cap on the total text injected into a conversation's system
// instruction from a project's files — mirrors lib/server/memory.ts's
// MAX_MEMORY_CONTEXT_CHARS for the same reason: a project can hold up to 20
// files (see app/api/projects/[id]/files/route.ts), which is more context
// than should be spent on every single turn regardless of relevance.
const MAX_PROJECT_FILES_CONTEXT_CHARS = 6000;

/**
 * Builds the project context string appended to a conversation's system
 * instruction (see lib/server/gemini.ts) — the project's custom
 * instructions plus its files' extracted text — or null if the
 * conversation has no project. Ownership is implied by the caller already
 * having verified the conversation belongs to this user; this only reads
 * the project referenced by that conversation's own `project_id`.
 */
export async function getProjectContext(
  supabase: Awaited<ReturnType<typeof getSessionUser>>["supabase"],
  projectId: string | null
): Promise<string | null> {
  if (!projectId) return null;

  const { data: project } = await supabase!.from("projects").select("name, instructions").eq("id", projectId).maybeSingle();
  if (!project) return null;

  const parts: string[] = [];
  if (project.instructions?.trim()) {
    parts.push(`Project "${project.name}" instructions:\n${project.instructions.trim()}`);
  }

  const { data: files } = await supabase!
    .from("project_files")
    .select("filename, extracted_text")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (files && files.length > 0) {
    let filesText = "";
    for (const { filename, extracted_text } of files as { filename: string; extracted_text: string }[]) {
      const chunk = `--- ${filename} ---\n${extracted_text}`;
      if (filesText.length + chunk.length + 2 > MAX_PROJECT_FILES_CONTEXT_CHARS) break;
      filesText += (filesText ? "\n\n" : "") + chunk;
    }
    if (filesText) parts.push(`Reference files for project "${project.name}":\n${filesText}`);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}
