import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="p-7 sm:p-8">
      <h1 className="font-display text-2xl font-semibold text-text">{title}</h1>
      <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
      <div className="mt-6">{children}</div>
      {footer && <div className="mt-6 border-t border-border-soft pt-5 text-center text-sm">{footer}</div>}
    </Card>
  );
}
