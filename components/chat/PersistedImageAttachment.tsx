"use client";

import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

/**
 * Re-displays a previously-sent image attachment after a reload, once the
 * client-only `Message.imageDataUrl` preview (set only for the current
 * session's just-sent message — see ChatContext's sendMessage) is gone.
 * Fetches a short-lived signed URL the same way the document/dataset chips
 * download their originals (see lib/server/storage.ts), just rendered
 * inline as an image instead of offered as a download.
 */
export function PersistedImageAttachment({ messageId }: { messageId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(`/api/messages/${messageId}/attachment`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error();
        if (!cancelled) setUrl(json.data.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  if (failed) {
    return (
      <div className="flex h-28 w-full items-center justify-center gap-1.5 rounded-lg bg-black/10 text-[13px] text-white/70">
        <ImageOff className="h-4 w-4" aria-hidden />
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-black/10">
        <Loader2 className="h-5 w-5 animate-spin text-white/70" aria-hidden />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not a stable app-hosted path next/image could optimize
    <img src={url} alt="Attached" className="max-h-64 w-full rounded-lg object-contain" />
  );
}
