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
  updateProfile: (
    updates: Partial<Pick<User, "name" | "email" | "memoryEnabled" | "customInstructionsAbout" | "customInstructionsStyle">>
  ) => void;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return;
      setUser(session?.user ? await toAppUser(supabase, session.user) : null);
      setIsLoading(false);
    });

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

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
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

      const { data, error } = await supabase.auth.signUp({
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
      });
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

    const { data, error } = await supabase.auth.signInAnonymously();
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [supabase]
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<AuthResult> => {
      if (newPassword.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [supabase]
  );

  const updateProfile = useCallback(
    (
      updates: Partial<
        Pick<User, "name" | "email" | "memoryEnabled" | "customInstructionsAbout" | "customInstructionsStyle">
      >
    ) => {
      setUser((prev) => (prev ? { ...prev, ...updates } : prev));

      void (async () => {
        const {
          data: { user: current },
        } = await supabase.auth.getUser();
        if (!current) return;

        if (updates.name !== undefined) {
          const { error } = await supabase.from("profiles").update({ name: updates.name }).eq("id", current.id);
          if (error) console.error("[auth] failed to update profile name:", error.message);
        }
        if (updates.email !== undefined && updates.email !== current.email) {
          const { error } = await supabase.auth.updateUser({ email: updates.email });
          if (error) console.error("[auth] failed to update email:", error.message);
        }
        if (updates.memoryEnabled !== undefined) {
          const { error } = await supabase
            .from("profiles")
            .update({ memory_enabled: updates.memoryEnabled })
            .eq("id", current.id);
          if (error) console.error("[auth] failed to update memory setting:", error.message);
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
          if (error) console.error("[auth] failed to update custom instructions:", error.message);
        }
      })();
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
