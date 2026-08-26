import Link from "next/link";
import { MessageCircle, ArrowRight } from "lucide-react";

export function Navbar() {
  return (
    <header className="border-b border-border-soft">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-text">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <MessageCircle className="h-4 w-4" aria-hidden />
          </span>
          Arova
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-text"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition-all hover:scale-[1.03] hover:opacity-95"
          >
            Get Started
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
