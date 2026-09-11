const isDev = process.env.NODE_ENV !== "production";

// Derived from the public Supabase URL so the CSP doesn't hand-maintain a
// second copy of project config — connect-src needs this origin for every
// Auth/REST call the browser makes directly to Supabase.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

// Gemini is called only from the server (lib/server/gemini.ts), never from
// the browser, so it needs no entry here — CSP only governs requests the
// page itself makes.
const connectSrc = ["'self'", supabaseOrigin, isDev && "ws://localhost:*", isDev && "http://localhost:*"]
  .filter(Boolean)
  .join(" ");

// 'unsafe-inline' stays in script-src because Next.js ships small inline
// bootstrap/hydration scripts in production, and 'unsafe-eval' is added only
// in dev because webpack's HMR client needs it — neither should be dropped
// without switching to a nonce-based CSP, which is a bigger change than a
// header tweak. style-src needs 'unsafe-inline' because the app sets
// per-mode colors via inline `style={{ backgroundColor: ... }}` throughout
// the chat/dashboard UI.
const scriptSrc = ["'self'", "'unsafe-inline'", isDev && "'unsafe-eval'"].filter(Boolean).join(" ");

const csp = [
  `default-src 'self'`,
  `script-src ${scriptSrc}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self' data:`,
  `connect-src ${connectSrc}`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Applies to every route, including /auth/callback and the API
        // routes — these are plain response headers, not something that can
        // interfere with the redirect logic in the auth callback or the
        // JSON/streaming responses from app/api/**.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microphone=(self) — an empty allowlist here (the previous
          // value) disables the feature outright for every context,
          // including same-origin, which silently broke the app's own
          // voice-input feature (Web Speech API's SpeechRecognition needs
          // microphone access) regardless of what the user allows in the
          // browser's own permission prompt. camera/geolocation stay fully
          // disabled — nothing in the app uses either.
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
