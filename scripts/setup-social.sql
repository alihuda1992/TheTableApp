-- setup-social.sql
-- Adds reactions and comments tables for The Table social features.
-- Run in: Supabase Dashboard → SQL Editor → Run
--
-- TABLES:
--   reactions  — thumbs up/down + emoji per user × restaurant (unique per type)
--   comments   — free-text comments per user × restaurant
--
-- RLS: anyone can read; authenticated users manage their own rows.
-- ============================================================

-- ── REACTIONS ──────────────────────────────────────────────
-- FK to profiles.id (not auth.users) so PostgREST can auto-join profiles.

create table if not exists public.reactions (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  type          text        not null,
  created_at    timestamptz not null default now(),
  constraint reactions_uq  unique (user_id, restaurant_id, type),
  constraint reactions_type check (type in ('up','down','🔥','❤️','😍','👏','🤔'))
);

alter table public.reactions enable row level security;

create policy "reactions: read all"
  on public.reactions for select using (true);

create policy "reactions: insert own"
  on public.reactions for insert
  with check (auth.uid() = user_id);

create policy "reactions: delete own"
  on public.reactions for delete
  using (auth.uid() = user_id);


-- ── COMMENTS ───────────────────────────────────────────────

create table if not exists public.comments (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  body          text        not null,
  created_at    timestamptz not null default now(),
  constraint comments_body check (char_length(body) between 1 and 500)
);

alter table public.comments enable row level security;

create policy "comments: read all"
  on public.comments for select using (true);

create policy "comments: insert own"
  on public.comments for insert
  with check (auth.uid() = user_id);

create policy "comments: delete own"
  on public.comments for delete
  using (auth.uid() = user_id);


-- ── VERIFY ─────────────────────────────────────────────────
select 'reactions' as table_name, count(*) as rows from public.reactions
union all
select 'comments', count(*) from public.comments;
