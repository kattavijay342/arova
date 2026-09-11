"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, FileText, FolderClosed, Loader2, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useProjects } from "@/lib/context/ProjectContext";
import { useChat } from "@/lib/context/ChatContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FullPageLoader } from "@/components/ui/Spinner";
import { ConversationItem } from "@/components/layout/ConversationItem";
import { NewChatMenu } from "@/components/layout/NewChatMenu";
import { documentTypeLabel, ALLOWED_DOCUMENT_MIME_TYPES, ALLOWED_DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES } from "@/lib/document";
import type { ProjectFile } from "@/lib/types";

interface RawProjectFile {
  id: string;
  filename: string;
  mime_type: string;
  char_count: number;
  truncated: boolean;
  created_at: string;
  storage_path?: string | null;
}

function mapFile(f: RawProjectFile): ProjectFile {
  return {
    id: f.id,
    filename: f.filename,
    mimeType: f.mime_type,
    charCount: f.char_count,
    truncated: f.truncated,
    createdAt: f.created_at,
    hasFileAttachment: Boolean(f.storage_path),
  };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { projects, hydrated, renameProject, updateInstructions, deleteProject } = useProjects();
  const { conversations, deleteConversation, renameConversation, moveConversationToProject } = useChat();

  const project = projects.find((p) => p.id === projectId);
  const projectConversations = conversations
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [instructionsSaved, setInstructionsSaved] = useState(false);

  const [files, setFiles] = useState<ProjectFile[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (project) setInstructions(project.instructions);
  }, [project?.id]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<RawProjectFile[]>(`/api/projects/${projectId}/files`)
      .then((rows) => {
        if (!cancelled) setFiles(rows.map(mapFile));
      })
      .catch((err) => {
        console.error("[projects] failed to load files:", err);
        if (!cancelled) setFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!hydrated) {
    return <FullPageLoader label="Loading project…" />;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 text-center">
        <p className="text-muted">This project doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Button className="mt-4" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  function commitRename() {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== project!.name) renameProject(project!.id, trimmed);
  }

  async function handleSaveInstructions() {
    setSavingInstructions(true);
    setInstructionsSaved(false);
    try {
      await updateInstructions(project!.id, instructions);
      setInstructionsSaved(true);
      setTimeout(() => setInstructionsSaved(false), 2000);
    } catch (err) {
      console.error("[projects] failed to save instructions:", err);
    } finally {
      setSavingInstructions(false);
    }
  }

  async function handleDeleteProject() {
    if (!window.confirm(`Delete project "${project!.name}"? Its conversations won't be deleted — they'll just be ungrouped.`)) {
      return;
    }
    await deleteProject(project!.id);
    router.push("/dashboard");
  }

  function handleFilePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      setUploadError("Supported files: PDF, DOCX, TXT, MD.");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setUploadError("File is too large — the limit is 10MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const data = dataUrl.split(",")[1] ?? "";
      setUploading(true);
      setUploadError(null);
      try {
        const row = await apiFetch<RawProjectFile>(`/api/projects/${projectId}/files`, {
          method: "POST",
          body: JSON.stringify({ filename: file.name, mimeType: file.type, data }),
        });
        setFiles((prev) => [mapFile(row), ...(prev ?? [])]);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Could not upload that file.");
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => setUploadError("Could not read the selected file.");
    reader.readAsDataURL(file);
  }

  async function handleDeleteFile(id: string) {
    setDeletingFileId(id);
    const previous = files;
    setFiles((prev) => (prev ?? []).filter((f) => f.id !== id));
    try {
      await apiFetch(`/api/projects/${projectId}/files/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[projects] failed to delete file:", err);
      setFiles(previous ?? null);
      setUploadError("Could not delete that file. Please try again.");
    } finally {
      setDeletingFileId(null);
    }
  }

  async function handleDownloadFile(id: string) {
    setDownloadingFileId(id);
    try {
      const { url } = await apiFetch<{ url: string }>(`/api/projects/${projectId}/files/${id}/attachment`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("[projects] failed to download file:", err);
      setUploadError("Could not download that file. Please try again.");
    } finally {
      setDownloadingFileId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-brand-soft text-brand">
            <FolderClosed className="h-5 w-5" aria-hidden />
          </span>
          {editingName ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="w-full max-w-md rounded-md border border-brand bg-surface px-2.5 py-1 font-display text-2xl font-semibold text-text focus:outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setDraftName(project.name);
                setEditingName(true);
              }}
              className="group flex min-w-0 items-center gap-2 text-left"
              title="Rename project"
            >
              <h1 className="truncate font-display text-2xl font-semibold text-text">{project.name}</h1>
              <Pencil className="h-4 w-4 flex-none text-faint opacity-0 group-hover:opacity-100" aria-hidden />
            </button>
          )}
        </div>
        <button
          onClick={handleDeleteProject}
          className="flex-none rounded-lg p-2 text-faint hover:bg-border-soft hover:text-danger"
          aria-label="Delete project"
          title="Delete project"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="mt-6">
        <NewChatMenu projectId={project.id} />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="font-display text-lg font-semibold text-text">Instructions</h2>
        <p className="text-[15px] text-muted">
          Given to the assistant as extra context for every conversation in this project.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="e.g. Focus on React and TypeScript. Keep answers concise and code-first."
          className="mt-4 w-full resize-y rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button
            size="sm"
            onClick={handleSaveInstructions}
            disabled={savingInstructions || instructions === project.instructions}
            loading={savingInstructions}
          >
            Save
          </Button>
          {instructionsSaved && <span className="text-[13px] text-muted">Saved</span>}
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-text">Files</h2>
            <p className="text-[15px] text-muted">Reference files given to the assistant alongside your instructions.</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_DOCUMENT_EXTENSIONS.join(",")}
            onChange={handleFilePick}
            className="hidden"
          />
          <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} loading={uploading}>
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            Add file
          </Button>
        </div>
        {uploadError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {uploadError}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {files === null ? (
            <p className="text-[15px] text-faint">Loading…</p>
          ) : files.length === 0 ? (
            <p className="text-[15px] text-faint">No files yet.</p>
          ) : (
            files.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border-soft px-3.5 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileText className="h-4 w-4 flex-none text-faint" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] text-text">{f.filename}</p>
                    <p className="font-mono text-[11px] uppercase text-faint">
                      {documentTypeLabel(f.mimeType)} · {f.charCount.toLocaleString()} chars
                      {f.truncated ? " (truncated)" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1">
                  {f.hasFileAttachment && (
                    <button
                      onClick={() => handleDownloadFile(f.id)}
                      disabled={downloadingFileId === f.id}
                      aria-label={`Download original file: ${f.filename}`}
                      title="Download original file"
                      className="text-faint hover:text-text disabled:opacity-50"
                    >
                      {downloadingFileId === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteFile(f.id)}
                    disabled={deletingFileId === f.id}
                    aria-label={`Delete file: ${f.filename}`}
                    className="text-faint hover:text-danger disabled:opacity-50"
                  >
                    {deletingFileId === f.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Conversations</h2>
        {projectConversations.length === 0 ? (
          <p className="text-[15px] text-faint">No conversations in this project yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {projectConversations.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={c}
                active={false}
                onDelete={deleteConversation}
                onRename={renameConversation}
                projects={projects}
                onMove={moveConversationToProject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
