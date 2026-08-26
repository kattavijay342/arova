"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Clock, Calendar } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { UsageStats } from "@/lib/types";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function UsageSection() {
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/usage")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json?.success) setStats(json.data as UsageStats);
      })
      .catch((err) => console.error("[settings] failed to load usage:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-6">
      <h2 className="font-display text-lg font-semibold text-text">Usage</h2>
      <p className="text-[15px] text-muted">A quick summary of your activity.</p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5 flex-none text-brand" aria-hidden />
          <div>
            <p className="font-display text-lg font-semibold text-text">{stats?.conversationCount ?? "—"}</p>
            <p className="text-[13px] text-faint">Conversations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 flex-none text-brand" aria-hidden />
          <div>
            <p className="font-display text-lg font-semibold text-text">{stats?.messageCount ?? "—"}</p>
            <p className="text-[13px] text-faint">Messages sent</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 flex-none text-brand" aria-hidden />
          <div>
            <p className="font-display text-lg font-semibold text-text">{formatDate(stats?.memberSince ?? null)}</p>
            <p className="text-[13px] text-faint">Member since</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
