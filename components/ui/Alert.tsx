import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Alert({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger",
        className
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
