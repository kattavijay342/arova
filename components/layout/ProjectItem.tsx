"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderClosed, MoreVertical, Pencil, Trash2 } from "lucide-react";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Menu } from "@/components/ui/Menu";

function ProjectItemImpl({
  project,
  active,
  onDelete,
  onRename,
}: {
  project: Project;
  active: boolean;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  function commitRename() {
    setEditing(false);
    if (draftName.trim() && draftName.trim() !== project.name) {
      onRename(project.id, draftName.trim());
    } else {
      setDraftName(project.name);
    }
  }

  function handleDelete() {
    if (window.confirm(`Delete project "${project.name}"? Its conversations won't be deleted — they'll just be ungrouped.`)) {
      onDelete(project.id);
      if (active) router.push("/dashboard");
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") commitRename();
          if (e.key === "Escape") {
            setDraftName(project.name);
            setEditing(false);
          }
        }}
        className="w-full rounded-md border border-brand bg-surface px-2.5 py-1.5 text-[15px] text-text focus:outline-none"
      />
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-lg border-l-[3px] border-l-transparent pr-1 transition-colors",
        !active && "hover:border-l-border hover:bg-border-soft"
      )}
      style={
        active
          ? { borderLeftColor: "var(--color-brand)", backgroundColor: "var(--color-brand-soft)" }
          : undefined
      }
    >
      <button
        onClick={() => router.push(`/projects/${project.id}`)}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
        title={project.name}
      >
        <FolderClosed className="h-4 w-4 flex-none text-faint" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate text-[15px]", active ? "font-semibold text-brand" : "text-text")}>
          {project.name}
        </span>
      </button>
      <Menu
        trigger={<MoreVertical className="h-4 w-4" aria-hidden />}
        ariaLabel={`Options for "${project.name}"`}
        items={[
          { label: "Rename", icon: <Pencil className="h-3.5 w-3.5" aria-hidden />, onClick: () => setEditing(true) },
          { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" aria-hidden />, onClick: handleDelete, danger: true },
        ]}
      />
    </div>
  );
}

export const ProjectItem = memo(ProjectItemImpl);
