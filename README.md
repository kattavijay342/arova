# Arova

Next.js 14 (App Router) + TypeScript + Tailwind CSS, backed by Supabase (Postgres +
Auth + Row Level Security). AI replies come from **Google Gemini** — the only AI
provider for this project.

## Problem statement

People exploring a topic, preparing for an interview, or thinking through a career or
study decision often want a focused conversational assistant rather than a
general-purpose chatbot. Arova provides mode-specific AI conversations (Student,
Career, General), with saved history per signed-in user, so a visitor can start
chatting immediately (as a guest) or create an account to keep their conversation
history across sessions.

## Key features

- **Mode-specific chat** — Student, Career, and General modes each use a distinct
  system prompt (`lib/server/systemInstructions.ts`).
- **Streaming AI replies** — responses stream in from Gemini as newline-delimited JSON
  chunks instead of waiting for the full reply.
- **Guest access** — visitors can "Continue as guest" (Supabase anonymous sign-in)
  without creating an account.
- **Persistent conversation history** — conversations and messages are saved to
  Supabase per user and listed on the dashboard/sidebar.
- **Resilient error handling** — missing configuration or a failed Gemini request
  returns a clear error with a Retry button; retrying does not duplicate the
  already-saved user message.
- **Row Level Security** — every row in Postgres is scoped to the signed-in user via
  Supabase RLS policies, not application-level checks alone.
- **Per-user rate limiting** — basic in-memory rate limiting on message sends
  (`lib/server/rateLimit.ts`).
- **Message feedback** — users can leave feedback on individual assistant messages.
- **Settings** — profile and preference management under `/settings`.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend + API routes | Next.js + React |
| AI model | Google Gemini API |
| Database + Auth | Supabase (PostgreSQL + Supabase Auth + Row Level Security) |
| Deployment | Vercel |
| Version control | GitHub |
| Styling | Tailwind CSS |

There is **no separate backend server**. All server-side logic lives in Next.js Route
Handlers under `app/api/`.

## Architecture overview

The browser talks only to the Next.js app. Client Components use the Supabase browser
client (`lib/supabase/client.ts`) directly for auth (sign up / log in / guest / sign
out) and call `app/api/**` Route Handlers for everything else (conversations,
messages, feedback, usage). Route Handlers use the Supabase server client
(`lib/supabase/server.ts`) to read the signed-in user from the session cookie, then
read/write Postgres — every query is additionally scoped by Row Level Security, so a
bug in application code cannot expose another user's rows. Sending a message calls
Gemini (`lib/server/gemini.ts`) and streams the reply back to the browser while saving
both the user message and the assistant reply to Supabase. `middleware.ts` refreshes
the Supabase session cookie on every request.

## Authentication

Authentication is handled entirely by **Supabase Auth** — there are no custom
authentication API routes. The frontend calls the Supabase Auth client SDK directly:
`signUp`, `signInWithPassword`, `signInAnonymously` (guest access), and `signOut`. A
signed-in session is stored in cookies and refreshed by `middleware.ts` /
`lib/supabase/middleware.ts` on every request. Every authenticated Route Handler reads
the current user via `lib/server/requireUser.ts`.

## AI integration

Google Gemini, and only Gemini — no local model, nothing to install or run yourself.
Get a key from Google AI Studio → https://aistudio.google.com/apikey and set
`GEMINI_API_KEY` in `.env.local` (server-only — never add a `NEXT_PUBLIC_` prefix, and
never import it from a `"use client"` component; it's only read inside
`app/api/**` route handlers via `lib/server/gemini.ts` and `lib/server/aiEnv.ts`).

## Database & storage

Supabase Postgres, with `supabase/schema.sql` defining three tables — `profiles`,
`conversations`, and `messages` — plus Row Level Security policies scoping every row
to the signed-in user (including anonymous/guest users). Run the script once in your
Supabase project's SQL Editor; it's safe to re-run.

## Security considerations

- **Server-only secrets** — `GEMINI_API_KEY` is read only inside `app/api/**` Route
  Handlers and is never exposed to the browser (no `NEXT_PUBLIC_` prefix, never
  imported from a `"use client"` component).
- **No service-role key in the app** — only the Supabase `anon`/`public` key is used,
  which only works through Row Level Security policies. The `service_role` key (which
  bypasses RLS) must never be added to this project.
- **Row Level Security** — enforced at the database level in `supabase/schema.sql`, so
  data access is scoped to the signed-in user even if application code has a bug.
- **Secrets stay out of git** — `.env.local` (real values) is git-ignored;
  `.env.local.example` (variable names only) is the only env file committed.
- **Basic rate limiting** — per-user in-memory rate limiting on message sends
  (`lib/server/rateLimit.ts`).

## Project structure

```
app/
  layout.tsx, globals.css, page.tsx     Root layout (fonts, AuthProvider) + Landing page
  (auth)/                               Centered auth layout, no sidebar
    login/page.tsx, signup/page.tsx
  auth/callback/route.ts                Exchanges the Supabase email-confirmation code for a session
  (app)/                                Authenticated shell: auth guard + sidebar + topbar
    layout.tsx
    dashboard/page.tsx
    chat/page.tsx                       Mode picker (no conversation selected yet)
    chat/[conversationId]/page.tsx      The actual chat interface
    settings/page.tsx
  api/
    conversations/route.ts              GET (list, with messages) / POST (create)
    conversations/[id]/route.ts         GET / PATCH (rename) / DELETE
    conversations/[id]/messages/route.ts POST — saves the message, calls Gemini, saves the reply

components/
  ui/          Generic, reused everywhere: Button, Input, Avatar, Badge, Card, Menu, Alert, Spinner
  landing/     Navbar, Hero, ModeShowcase, Footer
  auth/        AuthCard (shared shell), LoginForm, SignupForm
  layout/      AppShell, Sidebar, ConversationItem, Topbar
  dashboard/   ModeCard, RecentConversations
  chat/        ChatHeader, MessageList, MessageBubble, MessageContent (markdown),
               MessageInput, TypingIndicator, ErrorState, EmptyChatState,
               ModePicker, SuggestedPrompts
  settings/    ProfileSection, PreferencesSection

lib/
  types.ts               Mode, User, Message, Conversation
  modes.ts                Per-mode config: label, color, icon, greeting, suggested prompts
  utils.ts, storage.ts    Small helpers (id generation, formatting, localStorage wrapper —
                          storage.ts is now only used for the sidebar-collapsed UI preference)
  context/
    AuthContext.tsx        Real Supabase Auth session (sign in / sign up / guest / sign out)
    ChatContext.tsx         Conversations + messages, fetched from /api/conversations, streamed progressively
  server/
    aiProvider.ts            Thin pass-through to gemini.ts (kept as the route's only import point)
    gemini.ts                 AI replies via the Gemini API (streaming)
    aiEnv.ts                  Validates GEMINI_API_KEY, clear error if missing
    systemInstructions.ts    Student/Career/General prompts
    apiResponse.ts          Consistent { success, data } / { success, error } JSON envelope
    requireUser.ts          Reads the signed-in user from the Supabase session
    rateLimit.ts             Basic per-user in-memory rate limiting
  supabase/
    client.ts               Supabase client for Client Components (browser)
    server.ts                Supabase client for Route Handlers / Server Components
    middleware.ts            Refreshes the auth session cookie on every request
    env.ts                   Validates the two NEXT_PUBLIC_SUPABASE_* vars

middleware.ts             Runs lib/supabase/middleware.ts on every request

supabase/
  schema.sql               Tables + Row Level Security policies — run once in the
                            Supabase SQL Editor
```

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in real values (never commit
`.env.local`):

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key — safe for the browser, enforced by RLS |
| `AI_PROVIDER` | Yes | AI provider selector — currently only `gemini` is supported |
| `GEMINI_API_KEY` | Yes | Server-only Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | No | Overrides the default Gemini model |

Without the Supabase values, the app shows a "Missing Supabase configuration" message
instead of starting. Without `GEMINI_API_KEY`, sending a chat message returns a
"Missing AI configuration" error instead of a reply.

## Local installation

### Prerequisites

- Node.js (compatible with Next.js 14 / React 18)
- npm
- A Supabase project
- A Google AI Studio API key

### Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` as described in [Environment variables](#environment-variables).

Then, in your Supabase project's SQL Editor, run `supabase/schema.sql` once (safe to
re-run) — it creates the `profiles`, `conversations`, and `messages` tables plus Row
Level Security policies scoping every row to the signed-in user, and enables anonymous
("guest") sign-ins support in the `profiles` table.

To let visitors "Continue as guest," also enable **Anonymous sign-ins** in Supabase
Dashboard → Authentication → Providers. Without that toggle, guest sign-in shows a clear
error instead of failing silently — everything else (sign up / log in with a real
account) works regardless.

### Running the development server

```bash
npm run dev
```

Open http://localhost:3000.

## Try it

- **Real AI replies**: sign up or continue as guest, start a chat in any mode, and send
  a message — the reply streams in from Gemini, and both messages are saved to Supabase.
- **Error handling**: if `GEMINI_API_KEY` is missing, sending a message returns a clear
  "Missing AI configuration" error instead of a reply or a crash. If the Gemini request
  itself fails (quota, network), you get a clear "temporarily unavailable" error. Every
  failure has a Retry button — retrying does not create a duplicate message.
- **Modes**: Student, Career, and General each get a distinct system prompt (see
  `lib/server/systemInstructions.ts`).

## Testing

There is no automated test suite in this project yet. `npm run lint` runs Next.js/ESLint
static checks. To verify changes manually, run the dev server (`npm run dev`) and walk
through the flows in [Try it](#try-it) — sign-up/login/guest sign-in, sending a message
in each mode, retrying a failed send, and renaming/deleting a conversation.

## Production / build instructions

```bash
npm run build
npm run start
```

`npm run build` produces an optimized production build; `npm run start` serves it.
Set the same environment variables (see [Environment variables](#environment-variables))
in your production/deployment environment (e.g. Vercel project settings) — do not
commit real values.

## Screenshots

_Screenshots not yet added._

## Live demo

_No deployment URL yet._

## Future improvements

No formal roadmap has been defined yet.

## API reference

All responses use the envelope `{ "success": true, "data": ... }` or
`{ "success": false, "error": { "code", "message", "details?" } }`. Every route requires
a signed-in Supabase session, sent automatically via cookies.

- `GET /api/conversations` → conversation[] (with messages, sorted by `updated_at` desc)
- `POST /api/conversations` `{ mode: "student" | "career" | "general" }` → conversation
- `GET /api/conversations/:id` → conversation + messages
- `PATCH /api/conversations/:id` `{ title }` → conversation
- `DELETE /api/conversations/:id` → `{ deleted: true }`
- `POST /api/conversations/:id/messages` `{ content }` → a streamed, newline-delimited
  JSON response (`{"type":"chunk","delta":"..."}` repeatedly, then one
  `{"type":"done","assistantMessage":{...}}` or `{"type":"error",...}`). Retrying the
  exact same failed message reuses the already-saved user message instead of
  duplicating it.

Authentication itself has no custom API routes — the frontend calls the Supabase Auth
client SDK directly (`supabase.auth.signUp` / `signInWithPassword` / `signInAnonymously` /
`signOut`), which is the standard, simplest pattern for Next.js + Supabase.

## License

No license has been chosen yet. Add a `LICENSE` file to this repository to specify the
terms under which this code may be used, modified, or redistributed.
