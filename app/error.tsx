"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Route-level error boundary (Next.js App Router convention: must be a
 * Client Component named default-export `error.tsx`). Catches render-time
 * exceptions anywhere under app/ that aren't already handled locally, so a
 * bug shows this recoverable screen instead of a blank page or the
 * framework's bare default overlay.
 */
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5">
      <Card className="flex max-w-sm flex-col items-center gap-3 p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
        <h1 className="font-display text-lg font-semibold text-text">Something went wrong</h1>
        <p className="text-[15px] text-muted">
          An unexpected error occurred. You can try again, or head back to your dashboard.
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Go to dashboard
          </Button>
        </div>
      </Card>
    </div>
  );
}
