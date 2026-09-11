"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { User } from "../types";
import { createClient } from "../supabase/client";

interface AuthResult {
  ok: boolean;
  error?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  continueAsGuest: () => Promise<AuthResult>;
  signOut: () => void;
  /** Resolves to whether every attempted write actually succeeded — see the implementation for why this matters. */
  updateProfile: (
    updates: Partial<Pick<User, "name" | "email" | "memoryEnabled" | "customInstructionsAbout" | "customInstructionsStyle">>
  ) => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Supabase's auth-js client sets no fetch-level timeout of its own (verified
// against the installed SDK) — if Supabase's Auth service is slow or
// unreachable, an unbounded await leaves the sign-in/sign-up button spinning
// with zero feedback for as long as the underlying network request takes
// (observed: 60+ seconds during a real Supabase outage). This races the
// call against a fixed timeout so the UI fails fast with an honest,
// specific message instead — it never suppresses a real error that comes
// back within the window; it only stops waiting for one that doesn't.
const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const AUTH_TIMEOUT_MESSAGE = "This is taking longer than expected — Supabase isn't responding right now. Please try again in a moment.";

function withAuthTimeout<T>(promise: Promise<T>): Promise<T | "timeout"> {
  return Promise.race([
    promise,
    new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), AUTH_REQUEST_TIMEOUT_MS)),
  ]);
}

/** Maps a Supabase Auth user + its profiles row into the app's User shape. */
async function toAppUser(
  supabase: ReturnType<typeof createClient>,
  supabaseUser: SupabaseUser
): Promise<User> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, memory_enabled, custom_instructions_about, custom_instructions_style")
    .eq("id", supabaseUser.id)
    .maybeSingle();

  return {
    id: supabaseUser.id,
    name: profile?.name ?? supabaseUser.email?.split("@")[0] ?? "Guest",
    email: supabaseUser.email ?? "",
    isGuest: supabaseUser.is_anonymous ?? false,
    memoryEnabled: profile?.memory_enabled ?? true,
    customInstructionsAbout: profile?.custom_instructions_about ?? "",
    customInstructionsStyle: profile?.custom_instructions_style ?? "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // onAuthStateChange fires immediately on subscribe with an
    // "INITIAL_SESSION" event carrying the current session (this is
    // documented, current @supabase/auth-js behavior, verified against the
    // installed SDK) — a separate explicit `supabase.auth.getSession()` call
    // here was redundant with that, and both independently queried
    // `profiles` via toAppUser() for the same initial load, doubling the
    // Supabase Auth + database round-trips on every single app mount.
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      setUser(session?.user ? await toAppUser(supabase, session.user) : null);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
      if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

      const result = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
      if (result === "timeout") return { ok: false, error: AUTH_TIMEOUT_MESSAGE };
      const { data, error } = result;
      if (error) return { ok: false, error: error.message };

      // Set user state directly instead of waiting for the async
      // onAuthStateChange listener — the caller navigates right after this
      // resolves, and the route guard needs `user` to already be set by then.
      setUser(await toAppUser(supabase, data.user));
      return { ok: true };
    },
    [supabase]
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<AuthResult> => {
      if (name.trim().length < 2) return { ok: false, error: "Enter your full name." };
      if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
      // Just a cheap floor to catch an obviously-empty/trivial password
      // before a round trip — the real policy (length, complexity) lives in
      // Supabase Auth settings and can be stricter than this, so its error
      // message (surfaced below via `error.message`) is the authoritative one.
      if (password.length < 6) return { ok: false, error: "Enter a password." };

      const result = await withAuthTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() },
            // Sends the confirmation link to our own callback route (which
            // does an explicit server-side exchange, see app/auth/callback)
            // instead of the default: back to "/" relying on implicit
            // client-side detection, which fails silently if the link is
            // opened in a different browser than the one that signed up.
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
      );
      if (result === "timeout") return { ok: false, error: AUTH_TIMEOUT_MESSAGE };
      const { data, error } = result;
      if (error) return { ok: false, error: error.message };

      // If this Supabase project requires email confirmation, signUp
      // succeeds but returns no session yet — there's nothing to navigate
      // to until the user confirms, so say so instead of silently bouncing
      // them back to the login page.
      if (!data.session || !data.user) {
        return { ok: false, error: "Account created! Check your email to confirm it, then log in." };
      }

      setUser(await toAppUser(supabase, data.user));
      return { ok: true };
    },
    [supabase]
  );

  const continueAsGuest = useCallback(async (): Promise<AuthResult> => {
    // Best-effort throttle on bulk anonymous-account creation — checked
    // before calling Supabase so a blocked attempt never actually creates a
    // guest user. Fails open (proceeds to sign-in) if the check itself
    // can't be reached, so a transient network hiccup never blocks a real
    // guest from getting in.
    const limitCheck = await fetch("/api/auth/guest-limit", { method: "POST" }).catch(() => null);
    if (limitCheck && !limitCheck.ok) {
      const json = await limitCheck.json().catch(() => null);
      return {
        ok: false,
        error: json?.error?.message ?? "Too many guest sign-ins. Please try again later, or create an account instead.",
      };
    }

    const result = await withAuthTimeout(supabase.auth.signInAnonymously());
    if (result === "timeout") {
      return {
        ok: false,
        error: "This is taking longer than expected — Supabase isn't responding right now. Please try again in a moment, or create an account instead.",
      };
    }
    const { data, error } = result;
    if (error || !data.user) {
      if (error) {
        // Full detail goes to the console — the code below picks the
        // user-facing message based on *why* it failed instead of always
        // assuming the provider is disabled, which was misleading once the
        // provider was enabled but a different error (e.g. a DB trigger
        // failure) started happening instead.
        console.error("[auth] anonymous sign-in failed:", error.toJSON());
      }

      const message =
        error?.code === "anonymous_provider_disabled"
          ? "Guest access isn't enabled for this Supabase project yet. " +
            "Enable it in Supabase Dashboard → Authentication → Providers → Anonymous, " +
            "or create an account instead."
          : "Guest sign-in failed. Please try again in a moment, or create an account instead.";

      return { ok: false, error: message };
    }
    setUser(await toAppUser(supabase, data.user));
    return { ok: true };
  }, [supabase]);

  const signOut = useCallback(() => {
    void supabase.auth.signOut();
  }, [supabase]);

  const requestPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };

      // Supabase doesn't reveal whether the email is registered — a missing
      // account still resolves with no error here, which is what keeps this
      // safe from account enumeration.
      const result = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
      );
      if (result === "timeout") return { ok: false, error: AUTH_TIMEOUT_MESSAGE };
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true };
    },
    [supabase]
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<AuthResult> => {
      if (newPassword.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

      const result = await withAuthTimeout(supabase.auth.updateUser({ password: newPassword }));
      if (result === "timeout") return { ok: false, error: AUTH_TIMEOUT_MESSAGE };
      if (result.error) return { ok: false, error: result.error.message };
      return { ok: true };
    },
    [supabase]
  );

  // Returns whether every attempted write actually succeeded — callers that
  // only flip a low-stakes toggle (Memory's on/off switch) are free to
  // ignore the result exactly as before, but a caller safeguarding something
  // a user just spent effort typing (PersonalizationSection) needs a real
  // signal: the optimistic `setUser` below applies immediately for a
  // responsive UI, but without this, a failed Supabase write (network
  // hiccup, RLS error) left the UI permanently showing the new value as
  // "saved" with no error and no way to know it was never actually
  // persisted — silently lost on the next reload.
  const updateProfile = useCallback(
    async (
      updates: Partial<
        Pick<User, "name" | "email" | "memoryEnabled" | "customInstructionsAbout" | "customInstructionsStyle">
      >
    ): Promise<boolean> => {
      let previous: User | null = null;
      setUser((prev) => {
        previous = prev;
        return prev ? { ...prev, ...updates } : prev;
      });

      const {
        data: { user: current },
      } = await supabase.auth.getUser();
      if (!current) return false;

      let allOk = true;
      const failedKeys: (keyof User)[] = [];

      if (updates.name !== undefined) {
        const { error } = await supabase.from("profiles").update({ name: updates.name }).eq("id", current.id);
        if (error) {
          console.error("[auth] failed to update profile name:", error.message);
          allOk = false;
          failedKeys.push("name");
        }
      }
      if (updates.email !== undefined && updates.email !== current.email) {
        const { error } = await supabase.auth.updateUser({ email: updates.email });
        if (error) {
          console.error("[auth] failed to update email:", error.message);
          allOk = false;
          failedKeys.push("email");
        }
      }
      if (updates.memoryEnabled !== undefined) {
        const { error } = await supabase
          .from("profiles")
          .update({ memory_enabled: updates.memoryEnabled })
          .eq("id", current.id);
        if (error) {
          console.error("[auth] failed to update memory setting:", error.message);
          allOk = false;
          failedKeys.push("memoryEnabled");
        }
      }
      if (updates.customInstructionsAbout !== undefined || updates.customInstructionsStyle !== undefined) {
        const { error } = await supabase
          .from("profiles")
          .update({
            ...(updates.customInstructionsAbout !== undefined
              ? { custom_instructions_about: updates.customInstructionsAbout }
              : {}),
            ...(updates.customInstructionsStyle !== undefined
              ? { custom_instructions_style: updates.customInstructionsStyle }
              : {}),
          })
          .eq("id", current.id);
        if (error) {
          console.error("[auth] failed to update custom instructions:", error.message);
          allOk = false;
          failedKeys.push("customInstructionsAbout", "customInstructionsStyle");
        }
      }

      if (!allOk && previous) {
        const revert = previous;
        setUser((prev) => {
          if (!prev) return prev;
          const reverted = { ...prev };
          for (const key of failedKeys) (reverted as Record<string, unknown>)[key] = revert[key];
          return reverted;
        });
      }

      return allOk;
    },
    [supabase]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
      updateProfile,
      requestPasswordReset,
      updatePassword,
    }),
    [
      user,
      isLoading,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
      updateProfile,
      requestPasswordReset,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
