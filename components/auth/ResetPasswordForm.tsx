"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AuthCard } from "@/components/auth/AuthCard";
import { useAuth } from "@/lib/context/AuthContext";
import { createClient } from "@/lib/supabase/client";

type SessionState = "verifying" | "ready" | "invalid";

const INVALID_LINK_MESSAGE =
  "Your password reset link is invalid or has expired. Please request a new reset link.";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updatePassword } = useAuth();
  const [supabase] = useState(() => createClient());
  const [sessionState, setSessionState] = useState<SessionState>("verifying");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState(false);

  // Handles every way a Supabase recovery link can land here: a valid
  // `code` the client exchanges for a session (fires PASSWORD_RECOVERY), an
  // error Supabase attaches directly to the redirect when the link is
  // already expired/used, or no recovery info at all (page opened directly).
  useEffect(() => {
    if (searchParams.get("error") || searchParams.get("error_code")) {
      setSessionState("invalid");
      return;
    }

    let settled = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled || !session) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        settled = true;
        setSessionState("ready");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (settled || !session) return;
      settled = true;
      setSessionState("ready");
    });

    // A `code` param needs time for the client's PKCE exchange to complete;
    // no code at all means there's nothing to wait for.
    const hasCode = searchParams.has("code");
    const timeout = setTimeout(
      () => {
        if (settled) return;
        settled = true;
        setSessionState("invalid");
      },
      hasCode ? 8000 : 1500
    );

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase, searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError("Enter and confirm your new password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);

    if (!result.ok) {
      const message = result.error ?? "";
      // The recovery session can also expire between page load and submit —
      // route that case to the same "request a new link" state rather than
      // a dead-end inline error.
      if (/session/i.test(message)) {
        setSessionState("invalid");
        return;
      }
      setError(message || "Could not update your password. Please try again.");
      return;
    }

    setUpdated(true);
    setTimeout(() => router.push("/login"), 3000);
  }

  if (sessionState === "invalid") {
    return (
      <AuthCard title="Reset your password" subtitle={INVALID_LINK_MESSAGE}>
        <Link href="/forgot-password" className="font-semibold text-brand hover:underline">
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  if (updated) {
    return (
      <AuthCard title="Password updated successfully" subtitle="Redirecting you to login…">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-general-soft text-general">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <Button onClick={() => router.push("/login")} fullWidth>
            Back to login
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (sessionState === "verifying") {
    return (
      <AuthCard title="Reset your password" subtitle="Verifying your reset link…">
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Choose a new password for your account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          required
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter your new password"
          required
        />
        <Button type="submit" loading={loading} fullWidth>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
