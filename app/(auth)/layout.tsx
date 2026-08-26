import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-5 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 font-display text-lg font-semibold text-text">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
          <MessageCircle className="h-4 w-4" aria-hidden />
        </span>
        Arova
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
