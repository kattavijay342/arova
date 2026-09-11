-- Arova — Supabase schema (Phase 2: Project Setup)
-- Run this once in your Supabase project's SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────
-- profiles: one row per auth.users row, holds the editable name.
-- Supabase Auth already stores email/password; this table is only for
-- app-level profile data (display name) tied 1:1 to the authenticated user.
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text,
  created_at timestamptz not null default now()
);

-- Anonymous ("guest") users have no email — relax this for installs that
-- ran an earlier version of this schema where email was NOT NULL.
-- No-op (safe to re-run) if the column is already nullable.
alter table public.profiles alter column email drop not null;

-- Auto-create a profile row whenever a new user signs up via Supabase Auth,
-- including anonymous ("guest") sign-ins, which have no email.
--
-- Uses nullif(..., '') before coalesce() because Postgres coalesce() only
-- skips actual NULLs, not empty strings — and anonymous users' email comes
-- through as '' (empty string), not NULL, which let '' win over the
-- 'Guest' fallback below and left `name` empty in the UI.
--
-- `email` gets the same treatment: a real email is kept as-is; a missing
-- one (NULL or '') is replaced with a synthetic, per-user placeholder
-- (`<user-id>@guest.invalid`) instead of being stored as NULL. `.invalid`
-- is the RFC 2606 reserved TLD for exactly this — guaranteed to never be a
-- real, deliverable address — and keying it by id keeps every guest's
-- placeholder unique rather than every guest sharing one literal string.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Guest'
    ),
    coalesce(nullif(new.email, ''), new.id::text || '@guest.invalid')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Repair any existing rows created by the earlier (buggy) version of this
-- trigger above, where an anonymous user's empty-string email beat the
-- 'Guest' fallback and left `name` empty/blank.
update public.profiles set name = 'Guest' where name is null or name = '';

-- Same repair for `email`: backfill the same per-user placeholder onto any
-- existing row where it's still NULL (rows inserted before this fix).
-- No-op on rows that already have a real or placeholder email.
update public.profiles set email = id::text || '@guest.invalid' where email is null;

-- ─────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  mode       text not null check (mode in ('student', 'career', 'general')),
  title      text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);

-- ─────────────────────────────────────────────
-- Row Level Security — every table is scoped to the signed-in user.
-- ─────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "Users can view their own conversations" on public.conversations;
create policy "Users can view their own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own conversations" on public.conversations;
create policy "Users can create their own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own conversations" on public.conversations;
create policy "Users can update their own conversations"
  on public.conversations for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own conversations" on public.conversations;
create policy "Users can delete their own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view messages in their own conversations" on public.messages;
create policy "Users can view messages in their own conversations"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can insert messages into their own conversations" on public.messages;
create policy "Users can insert messages into their own conversations"
  on public.messages for insert
  with check (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- Added for chat-management Phase 1 (edit/delete a single message). The
-- table previously had no update/delete policy, so both actions would have
-- been silently blocked by RLS even with a correct API route in front of them.
drop policy if exists "Users can update messages in their own conversations" on public.messages;
create policy "Users can update messages in their own conversations"
  on public.messages for update
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete messages in their own conversations" on public.messages;
create policy "Users can delete messages in their own conversations"
  on public.messages for delete
  using (
    exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- message_feedback: thumbs up/down (+ optional comment) on a message,
-- one row per (message, user).
-- ─────────────────────────────────────────────
create table if not exists public.message_feedback (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  rating     text not null check (rating in ('up', 'down')),
  comment    text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, user_id)
);

create index if not exists message_feedback_message_id_idx on public.message_feedback (message_id);
create index if not exists message_feedback_user_id_idx on public.message_feedback (user_id);

drop trigger if exists message_feedback_set_updated_at on public.message_feedback;
create trigger message_feedback_set_updated_at
  before update on public.message_feedback
  for each row execute function public.set_updated_at();

alter table public.message_feedback enable row level security;

drop policy if exists "Users can view their own feedback" on public.message_feedback;
create policy "Users can view their own feedback"
  on public.message_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add feedback to their own conversations" on public.message_feedback;
create policy "Users can add feedback to their own conversations"
  on public.message_feedback for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_feedback.message_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own feedback" on public.message_feedback;
create policy "Users can update their own feedback"
  on public.message_feedback for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own feedback" on public.message_feedback;
create policy "Users can delete their own feedback"
  on public.message_feedback for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- user_usage_stats: basic usage info, computed on the fly from existing
-- tables (nothing duplicated/stored). security_invoker makes Postgres
-- evaluate this view under the *calling* user's RLS, so each user only ever
-- sees their own row.
-- ─────────────────────────────────────────────
create or replace view public.user_usage_stats
with (security_invoker = true) as
select
  p.id as user_id,
  p.created_at as member_since,
  count(distinct c.id) as conversation_count,
  count(m.id) as message_count,
  max(m.created_at) as last_active_at
from public.profiles p
left join public.conversations c on c.user_id = p.id
left join public.messages m on m.conversation_id = c.id
group by p.id, p.created_at;

-- ─────────────────────────────────────────────
-- Memory (Phase 6): short, user-saved facts the AI is given as context on
-- every message, across every conversation and mode. Manual only — there is
-- no automatic extraction anywhere in this app, so nothing is ever stored
-- here unless the user explicitly chose to save it (via the "Remember
-- this" action or the Settings page). `memory_enabled` on profiles is a
-- separate, non-destructive on/off switch: turning it off stops memories
-- from being saved or used, without deleting any of them.
-- ─────────────────────────────────────────────
alter table public.profiles add column if not exists memory_enabled boolean not null default true;

create table if not exists public.user_memories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists user_memories_user_id_idx on public.user_memories (user_id);

alter table public.user_memories enable row level security;

drop policy if exists "Users can view their own memories" on public.user_memories;
create policy "Users can view their own memories"
  on public.user_memories for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own memories" on public.user_memories;
create policy "Users can create their own memories"
  on public.user_memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own memories" on public.user_memories;
create policy "Users can delete their own memories"
  on public.user_memories for delete
  using (auth.uid() = user_id);

-- Added for Phase 12 (Memory): editing a saved memory in place. The table
-- previously had no update policy, so PATCH /api/memories/[id] would have
-- been silently blocked by RLS even with a correct route in front of it —
-- the same class of gap messages.update had before Phase 1's fix.
drop policy if exists "Users can update their own memories" on public.user_memories;
create policy "Users can update their own memories"
  on public.user_memories for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Projects (Phase 7): a mode-agnostic container that groups conversations
-- together, with its own custom instructions and reference files — both
-- given to the AI as extra context (alongside the mode's own instructions
-- and any memory) for every conversation inside the project. A
-- conversation's `project_id` is optional; conversations with no project
-- keep working exactly as before.
-- ─────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 100),
  instructions text not null default '' check (char_length(instructions) <= 4000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

alter table public.projects enable row level security;

drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own projects" on public.projects;
create policy "Users can create their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Nullable, optional link — `on delete set null` so deleting a project
-- never deletes the conversations that were inside it, just un-groups them.
alter table public.conversations add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists conversations_project_id_idx on public.conversations (project_id);

create table if not exists public.project_files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  filename       text not null,
  mime_type      text not null,
  extracted_text text not null,
  char_count     integer not null,
  truncated      boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists project_files_project_id_idx on public.project_files (project_id);

alter table public.project_files enable row level security;

drop policy if exists "Users can view files in their own projects" on public.project_files;
create policy "Users can view files in their own projects"
  on public.project_files for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_files.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can add files to their own projects" on public.project_files;
create policy "Users can add files to their own projects"
  on public.project_files for insert
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_files.project_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete files in their own projects" on public.project_files;
create policy "Users can delete files in their own projects"
  on public.project_files for delete
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_files.project_id and p.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Advanced Personalization (Phase 11): two free-text, global preferences —
-- "what should the assistant know about you" and "how should it respond" —
-- given to the AI as extra context on every message, in every mode and
-- every conversation (including ones inside a project). Distinct from
-- Memory (a list of discrete facts) and a project's own instructions
-- (scoped to just that project): this is account-wide style/context that
-- travels everywhere, mirroring ChatGPT's "Custom Instructions". Lives
-- directly on `profiles` (one pair of values per user, not a list), guarded
-- by the same RLS the table already has from Phase 1.
-- ─────────────────────────────────────────────
alter table public.profiles add column if not exists custom_instructions_about text not null default '' check (char_length(custom_instructions_about) <= 1500);
alter table public.profiles add column if not exists custom_instructions_style text not null default '' check (char_length(custom_instructions_style) <= 1500);

-- ─────────────────────────────────────────────
-- File attachments (Phase 6: Files & Documents) — persists the *original*
-- uploaded document/dataset bytes in Supabase Storage, not just their
-- extracted text. Before this, a document/CSV attachment's extracted text
-- was embedded in `messages.content` (or `project_files.extracted_text`)
-- and the original file was discarded right after extraction — a user
-- could see what the AI read from their file but never get the original
-- file itself back. Image attachments are deliberately excluded (see
-- lib/types.ts's ImageAttachment comment) — they're multimodal input for
-- the turn they're sent in, never persisted at all, and that design is
-- unchanged here.
--
-- One private bucket, folder-scoped per user (`<user_id>/...`) so the
-- existing Supabase Storage folder-ownership RLS pattern applies directly:
-- `storage.foldername(name)` splits the object's path on "/", and its
-- first segment must equal the caller's own auth.uid(). Never a public
-- bucket — every read/write is gated by these policies, and the app never
-- exposes the bucket's own URL scheme, only short-lived signed URLs
-- generated server-side after re-checking ownership of the owning
-- message/project file row (see app/api/messages/[id]/attachment/route.ts
-- and app/api/projects/[id]/files/[fileId]/attachment/route.ts).
-- ─────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own attachments" on storage.objects;
create policy "Users can upload their own attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own attachments" on storage.objects;
create policy "Users can view their own attachments"
  on storage.objects for select
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own attachments" on storage.objects;
create policy "Users can delete their own attachments"
  on storage.objects for delete
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Nullable — only set going forward for a document/dataset message; a
-- message with no attachment, an image attachment, or one sent before this
-- feature shipped simply has all three columns null, which every reader
-- already treats as "no downloadable original" rather than an error.
alter table public.messages add column if not exists attachment_path text;
alter table public.messages add column if not exists attachment_filename text;
alter table public.messages add column if not exists attachment_mime_type text;

alter table public.project_files add column if not exists storage_path text;
