"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Brain, Loader2, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/context/AuthContext";
import { cn } from "@/lib/utils";
import type { UserMemory } from "@/lib/types";

interface RawMemory {
  id: string;
  content: string;
  created_at: string;
}

function mapMemory(m: RawMemory): UserMemory {
  return { id: m.id, content: m.content, createdAt: m.created_at };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

/**
 * Manual only — there is no automatic memory extraction anywhere in this
 * app. A memory only ever exists because the user typed it here (or used
 * "Remember this" on their own message in chat). "Use memory" pauses the
 * feature without deleting anything already saved; deleting a memory is a
 * separate, permanent action.
 */
export function MemorySection() {
  const { user, updateProfile } = useAuth();
  const [memories, setMemories] = useState<UserMemory[] | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const memoryEnabled = user?.memoryEnabled ?? true;
  const disabled = Boolean(user?.isGuest);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<RawMemory[]>("/api/memories")
      .then((rows) => {
        if (!cancelled) setMemories(rows.map(mapMemory));
      })
      .catch((err) => {
        console.error("[settings] failed to load memories:", err);
        if (!cancelled) setMemories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || saving) return;

    setSaving(true);
    setError(null);
    try {
      const row = await apiFetch<RawMemory>("/api/memories", {
        method: "POST",
        body: JSON.stringify({ content: trimmed }),
      });
      setMemories((prev) => [mapMemory(row), ...(prev ?? [])]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const previous = memories;
    setMemories((prev) => (prev ?? []).filter((m) => m.id !== id));
    try {
      await apiFetch(`/api/memories/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[settings] failed to delete memory:", err);
      setMemories(previous ?? null);
      setError("Could not delete that memory. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold text-text">Memory</h2>
      <p className="text-[15px] text-muted">
        Facts you save here are shared with the assistant in every conversation, in every mode — nothing is added
        automatically.
      </p>

      <div className="mt-5 flex items-center justify-between gap-4 border-b border-border-soft pb-5">
        <div className="flex items-start gap-3">
          <Brain className="mt-0.5 h-4 w-4 flex-none text-faint" aria-hidden />
          <div>
            <p className="text-[15px] font-semibold text-text">Use memory</p>
            <p className="text-[15px] text-muted">
              {memoryEnabled
                ? "The assistant can see and use your saved memories."
                : "Paused — nothing is saved or used until you turn this back on. Your existing memories are kept."}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={memoryEnabled}
          aria-label="Use memory"
          onClick={() => updateProfile({ memoryEnabled: !memoryEnabled })}
          disabled={disabled}
          className={cn(
            "relative h-6 w-11 flex-none rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            memoryEnabled ? "bg-brand" : "bg-border"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform",
              memoryEnabled ? "translate-x-[22px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <form onSubmit={handleAdd} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={disabled || !memoryEnabled}
          maxLength={500}
          placeholder="e.g. I'm a second-year CS student, prefer concise answers"
          aria-label="New memory"
          className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] text-text placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
        />
        <Button type="submit" disabled={disabled || !memoryEnabled || !draft.trim() || saving} loading={saving}>
          <Plus className="h-4 w-4" aria-hidden />
          Add
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {disabled && <p className="mt-2 text-[13px] text-faint">Create an account to save memories across sessions.</p>}

      <div className="mt-4 flex flex-col gap-2">
        {memories === null ? (
          <p className="text-[15px] text-faint">Loading…</p>
        ) : memories.length === 0 ? (
          <p className="text-[15px] text-faint">Nothing saved yet.</p>
        ) : (
          memories.map((m) => (
            <div
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border-soft px-3.5 py-2.5"
            >
              <p className="text-[15px] text-text">{m.content}</p>
              <button
                onClick={() => handleDelete(m.id)}
                disabled={deletingId === m.id}
                aria-label={`Delete memory: ${m.content}`}
                className="flex-none text-faint hover:text-danger disabled:opacity-50"
              >
                {deletingId === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
