"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Project } from "../types";
import { useAuth } from "./AuthContext";

interface ProjectState {
  projects: Project[];
  hydrated: boolean;
}

type Action =
  | { type: "HYDRATE"; projects: Project[] }
  | { type: "ADD_PROJECT"; project: Project }
  | { type: "UPDATE_PROJECT"; project: Project }
  | { type: "REMOVE_PROJECT"; id: string };

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, projects: action.projects, hydrated: true };
    case "ADD_PROJECT":
      return { ...state, projects: [action.project, ...state.projects] };
    case "UPDATE_PROJECT":
      return { ...state, projects: state.projects.map((p) => (p.id === action.project.id ? action.project : p)) };
    case "REMOVE_PROJECT":
      return { ...state, projects: state.projects.filter((p) => p.id !== action.id) };
    default:
      return state;
  }
}

interface ProjectContextValue {
  projects: Project[];
  hydrated: boolean;
  getProject: (id: string) => Project | undefined;
  createProject: (name: string) => Promise<string>;
  renameProject: (id: string, name: string) => Promise<void>;
  updateInstructions: (id: string, instructions: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

interface RawProject {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

function mapProject(p: RawProject): Project {
  return { id: p.id, name: p.name, instructions: p.instructions, createdAt: p.created_at, updatedAt: p.updated_at };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, { projects: [], hydrated: false });
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    apiFetch<RawProject[]>("/api/projects")
      .then((rows) => {
        if (!cancelled) dispatch({ type: "HYDRATE", projects: rows.map(mapProject) });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[projects] failed to load:", err);
          dispatch({ type: "HYDRATE", projects: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const getProject = useCallback((id: string) => state.projects.find((p) => p.id === id), [state.projects]);

  const createProject = useCallback(async (name: string): Promise<string> => {
    const row = await apiFetch<RawProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    const project = mapProject(row);
    dispatch({ type: "ADD_PROJECT", project });
    return project.id;
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const row = await apiFetch<RawProject>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: trimmed }),
    });
    dispatch({ type: "UPDATE_PROJECT", project: mapProject(row) });
  }, []);

  const updateInstructions = useCallback(async (id: string, instructions: string) => {
    const row = await apiFetch<RawProject>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ instructions }),
    });
    dispatch({ type: "UPDATE_PROJECT", project: mapProject(row) });
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    dispatch({ type: "REMOVE_PROJECT", id });
    await apiFetch(`/api/projects/${id}`, { method: "DELETE" }).catch((err) => {
      console.error("[projects] failed to delete:", err);
    });
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects: state.projects,
      hydrated: state.hydrated,
      getProject,
      createProject,
      renameProject,
      updateInstructions,
      deleteProject,
    }),
    [state.projects, state.hydrated, getProject, createProject, renameProject, updateInstructions, deleteProject]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjects(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectProvider");
  return ctx;
}
