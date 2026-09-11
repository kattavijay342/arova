"use client";

import { useEffect } from "react";

/**
 * Next.js App Router convention: unlike app/error.tsx (which only catches
 * errors thrown by a page/layout *under* the root layout), a failure in
 * app/layout.tsx itself — a font-loading failure, an error inside
 * AuthProvider's render — can only be caught here. This file replaces the
 * entire root layout when it renders, so it must define its own <html>/
 * <body> rather than relying on the one in app/layout.tsx (which, having
 * thrown, is no longer being rendered). Kept deliberately minimal — no
 * Card/Button/icon components, no Tailwind classes relying on globals.css
 * having loaded — since the very thing that failed might be something this
 * page would otherwise also depend on.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] unhandled root-layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#10151d",
          color: "#e7ebf1",
          margin: 0,
          padding: "20px",
        }}
      >
        <div style={{ maxWidth: 380, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#a9b3c1", marginBottom: 20, lineHeight: 1.5 }}>
            Arova hit an unexpected error loading the app. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#3d4fa8",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 20px",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
