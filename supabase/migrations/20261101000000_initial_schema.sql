-- The application's tables (ADR-017). Everything reaches them through Nitro
-- with the service key. RLS is on with no policies, so a leaked anon key can
-- read nothing.

create table public.managers (
  id uuid primary key default gen_random_uuid(),
  -- Null for an AI Manager, which has no account (D-04).
  auth_id uuid unique references auth.users (id) on delete cascade,
  name text not null,
  is_ai boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers (id) on delete cascade,
  club_id text not null,
  seed integer not null,
  -- `json`, not `jsonb`: stored as written. Nothing queries inside it.
  state json not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One Season at a time. Dropping this index allows several.
create unique index seasons_one_per_manager on public.seasons (manager_id);

create table public.fixture_results (
  season_id uuid not null references public.seasons (id) on delete cascade,
  fixture_id text not null,
  day integer not null,
  home_club_id text not null,
  away_club_id text not null,
  home_goals integer not null,
  away_goals integer not null,
  decided_in text not null,
  -- The box score, folded from the stream (D-03).
  stats jsonb not null,
  -- The stream itself. Only the Manager's own Fixtures keep it.
  events json,
  primary key (season_id, fixture_id)
);

create index fixture_results_by_day on public.fixture_results (season_id, day);

alter table public.managers enable row level security;
alter table public.seasons enable row level security;
alter table public.fixture_results enable row level security;
