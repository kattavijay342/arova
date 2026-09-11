"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AuthCard } from "@/components/auth/AuthCard";
import { useAuth } from "@/lib/context/AuthContext";

export function ForgotPasswordForm() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setLoading(true);
    const result = await requestPasswordReset(email.trim());
    setLoading(false);

    if (!result.ok) {
      setError(result.error ?? "Could not send reset link. Please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Password reset link sent!" subtitle="Check your email for the password reset link.">
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-general-soft text-general">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </span>
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Back to login
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a password reset link."
      footer={
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to login
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <Button type="submit" loading={loading} fullWidth>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
