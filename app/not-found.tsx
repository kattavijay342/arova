import Link from "next/link";
import { MessageSquareX } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * Next.js App Router convention: default export from app/not-found.tsx
 * renders for any unmatched route. Plain server component — no client
 * interactivity needed for a link back home, so it stays out of the client
 * bundle.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-5">
      <Card className="flex max-w-sm flex-col items-center gap-3 p-8 text-center">
        <MessageSquareX className="h-8 w-8 text-faint" aria-hidden />
        <h1 className="font-display text-lg font-semibold text-text">Page not found</h1>
        <p className="text-[15px] text-muted">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] hover:opacity-95"
        >
          Back to home
        </Link>
      </Card>
    </div>
  );
}
