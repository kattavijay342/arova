"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AuthCard } from "@/components/auth/AuthCard";
import { useAuth } from "@/lib/context/AuthContext";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, continueAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Surfaces a failed email-confirmation exchange (see app/auth/callback)
  // instead of leaving the user stuck with no explanation.
  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) setError(callbackError);
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Could not log in. Please try again.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <span className="text-muted">
          New here?{" "}
          <Link href="/signup" className="font-semibold text-brand hover:underline">
            Create an account
          </Link>
        </span>
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
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          required
        />
        <Button type="submit" loading={loading} fullWidth>
          Log in
        </Button>
        <Button
          type="button"
          variant="secondary"
          fullWidth
          onClick={async () => {
            setError(null);
            const result = await continueAsGuest();
            if (!result.ok) {
              setError(result.error ?? "Could not continue as guest.");
              return;
            }
            router.push("/dashboard");
          }}
        >
          Continue as guest
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-faint">
        Your account and conversations are securely stored with Supabase.
      </p>
    </AuthCard>
  );
}
