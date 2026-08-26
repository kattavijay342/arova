"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { AuthCard } from "@/components/auth/AuthCard";
import { useAuth } from "@/lib/context/AuthContext";

export function SignupForm() {
  const router = useRouter();
  const { signUp, continueAsGuest } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await signUp(name, email, password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Could not create your account. Please try again.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Free to use — pick your mode and start chatting."
      footer={
        <span className="text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Log in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <Input
          label="Full name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ananya Sharma"
          required
        />
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a strong password"
          required
        />
        <Button type="submit" loading={loading} fullWidth>
          Create account
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
