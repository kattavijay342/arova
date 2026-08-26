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
