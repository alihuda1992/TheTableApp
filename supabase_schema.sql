-- ============================================================
-- The Table — Hardened Supabase Schema v2
-- ============================================================
-- WHAT CHANGED FROM v1:
--   1. Input length constraints on all text columns (prevents storage DoS)
--   2. Username sanitized at DB level (regex check + unique suffix loop)
--   3. overall_avg now SERVER-COMPUTED via generated column (not client-supplied)
--   4. coords range constraints (valid lat/lng only)
--   5. category enforced as enum at DB level
--   6. would_return: removed empty string as valid value
--   7. Indexes on RLS hot paths (user_id, is_public)
--   8. Cross-ownership guard trigger: can't attach dish to another user's restaurant
--   9. Public-consistency guard: can't make dish public if its restaurant is private
--  10. updated_at set by DB trigger, never accepted from client (prevents spoofing)
--  11. Per-user record limits enforced in DB (storage DoS protection)
--  12. RLS update policies include WITH CHECK to prevent owner-field tampering
--  13. Avatar color validated as proper hex code
-- ============================================================

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id            uuid    primary key references auth.users(id) on delete cascade,
  username      text    unique not null
                          check (length(username) between 2 and 30)
                          check (username ~ '^[a-zA-Z0-9_]+$'),
  display_name  text    check (length(display_name) <= 60),
  avatar_color  text    default '#c0622a'
                          check (avatar_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at    timestamptz default now()
);

-- ============================================================
-- RESTAURANTS
-- ============================================================
create table if not exists restaurants (
  id               uuid    primary key default gen_random_uuid(),
  user_id          uuid    not null references public.profiles(id) on delete cascade,
  name             text    not null check (length(name) between 1 and 200),
  cuisine          text    check (length(cuisine) <= 100),
  city             text    check (length(city) <= 100),
  visit_date       text    check (length(visit_date) <= 50),
  address          text    check (length(address) <= 300),
  coords_lat       double precision check (coords_lat between -90 and 90),
  coords_lng       double precision check (coords_lng between -180 and 180),
  rating_food      int     check (rating_food between 1 and 5),
  rating_atmosphere int    check (rating_atmosphere between 1 and 5),
  rating_service   int     check (rating_service between 1 and 5),
  rating_noise     int     check (rating_noise between 1 and 5),
  rating_value     int     check (rating_value between 1 and 5),
  overall_avg      numeric(3,1) generated always as (
    case when (
      rating_food is not null or rating_atmosphere is not null or
      rating_service is not null or rating_noise is not null or rating_value is not null
    ) then round((
      coalesce(rating_food,0) + coalesce(rating_atmosphere,0) +
      coalesce(rating_service,0) + coalesce(rating_noise,0) + coalesce(rating_value,0)
    )::numeric / nullif(
      (rating_food is not null)::int + (rating_atmosphere is not null)::int +
      (rating_service is not null)::int + (rating_noise is not null)::int +
      (rating_value is not null)::int, 0
    ), 1)
    else null end
  ) stored,
  notes            text    check (length(notes) <= 5000),
  would_return     text    check (would_return in ('yes','maybe','no')),
  is_public        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- DISHES
-- ============================================================
create table if not exists dishes (
  id             uuid    primary key default gen_random_uuid(),
  user_id        uuid    not null references public.profiles(id) on delete cascade,
  restaurant_id  uuid    references restaurants(id) on delete cascade,
  name           text    not null check (length(name) between 1 and 200),
  category       text    check (category in ('Starter','Main','Dessert','Drink','Side','Other')),
  rating         int     check (rating between 1 and 10),
  notes          text    check (length(notes) <= 2000),
  is_public      boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists restaurants_user_id_idx on restaurants(user_id);
create index if not exists restaurants_public_idx  on restaurants(is_public) where is_public = true;
create index if not exists dishes_user_id_idx      on dishes(user_id);
create index if not exists dishes_restaurant_idx   on dishes(restaurant_id);
create index if not exists dishes_public_idx       on dishes(is_public) where is_public = true;

-- ============================================================
-- TRIGGER: auto-set updated_at (server-side only)
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists restaurants_updated_at on restaurants;
create trigger restaurants_updated_at
  before update on restaurants
  for each row execute procedure set_updated_at();

-- ============================================================
-- TRIGGER: cross-ownership guard on dishes
-- ============================================================
create or replace function check_dish_restaurant_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.restaurant_id is not null then
    if not exists (
      select 1 from restaurants
      where id = new.restaurant_id and user_id = new.user_id
    ) then
      raise exception 'You can only attach dishes to your own restaurants';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_ownership_check on dishes;
create trigger dishes_ownership_check
  before insert or update on dishes
  for each row execute procedure check_dish_restaurant_ownership();

-- ============================================================
-- TRIGGER: dish public-consistency guard
-- ============================================================
create or replace function check_dish_public_consistency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_public = true and new.restaurant_id is not null then
    if exists (
      select 1 from restaurants
      where id = new.restaurant_id and is_public = false
    ) then
      raise exception 'Cannot make a dish public when its restaurant is private';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_public_check on dishes;
create trigger dishes_public_check
  before insert or update on dishes
  for each row execute procedure check_dish_public_consistency();

-- ============================================================
-- TRIGGER: per-user record limits (storage DoS protection)
-- ============================================================
create or replace function enforce_restaurant_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from restaurants where user_id = new.user_id) >= 500 then
    raise exception 'Maximum of 500 restaurants per account';
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_limit on restaurants;
create trigger restaurants_limit
  before insert on restaurants
  for each row execute procedure enforce_restaurant_limit();

create or replace function enforce_dish_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from dishes where user_id = new.user_id) >= 2000 then
    raise exception 'Maximum of 2000 dishes per account';
  end if;
  return new;
end;
$$;

drop trigger if exists dishes_limit on dishes;
create trigger dishes_limit
  before insert on dishes
  for each row execute procedure enforce_dish_limit();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table profiles    enable row level security;
alter table restaurants enable row level security;
alter table dishes      enable row level security;

drop policy if exists "profiles_select"        on profiles;
drop policy if exists "profiles_insert"        on profiles;
drop policy if exists "profiles_update"        on profiles;
drop policy if exists "restaurants_select_own" on restaurants;
drop policy if exists "restaurants_select"     on restaurants;
drop policy if exists "restaurants_insert"     on restaurants;
drop policy if exists "restaurants_update"     on restaurants;
drop policy if exists "restaurants_delete"     on restaurants;
drop policy if exists "dishes_select"          on dishes;
drop policy if exists "dishes_insert"          on dishes;
drop policy if exists "dishes_update"          on dishes;
drop policy if exists "dishes_delete"          on dishes;

-- Profiles
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update
  using  (auth.uid() = id)
  with check (auth.uid() = id);

-- Restaurants
create policy "restaurants_select" on restaurants
  for select using (auth.uid() = user_id or is_public = true);
create policy "restaurants_insert" on restaurants
  for insert with check (auth.uid() = user_id);
create policy "restaurants_update" on restaurants
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "restaurants_delete" on restaurants
  for delete using (auth.uid() = user_id);

-- Dishes
create policy "dishes_select" on dishes
  for select using (auth.uid() = user_id or is_public = true);
create policy "dishes_insert" on dishes
  for insert with check (auth.uid() = user_id);
create policy "dishes_update" on dishes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "dishes_delete" on dishes
  for delete using (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP (sanitized, collision-safe)
-- ============================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  raw_username  text;
  safe_username text;
  final_username text;
  counter       int := 0;
begin
  raw_username  := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));
  safe_username := regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g');
  safe_username := left(safe_username, 28);
  if length(safe_username) < 2 then safe_username := 'user'; end if;

  final_username := safe_username;
  loop
    exit when not exists (select 1 from profiles where username = final_username);
    counter := counter + 1;
    final_username := safe_username || counter::text;
    exit when counter > 9999;
  end loop;

  insert into profiles (id, username, display_name)
  values (
    new.id,
    final_username,
    left(coalesce(new.raw_user_meta_data->>'display_name', final_username), 60)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
