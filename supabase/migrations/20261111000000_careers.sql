-- A career across Seasons (ADR-029). A career is a row, each Season a row, and
-- a finished Season's record is stored split between `seasons.record` and
-- `player_seasons`. `players` keeps the names a record does not hold.

create table public.careers (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.managers (id) on delete cascade,
  seed integer not null,
  created_at timestamptz not null default now()
);

-- One career at a time, as there was one Season. Dropping this index allows several.
create unique index careers_one_per_manager on public.careers (manager_id);

alter table public.seasons
  add column career_id uuid references public.careers (id) on delete cascade,
  add column year integer,
  -- Which value `state` holds: a SeasonState, or the Offseason after it.
  add column phase text not null default 'season' check (phase in ('season', 'offseason')),
  -- The record's own parts once the Season has ended; the Players' part is in `player_seasons`.
  add column record json;

-- Every stored Season becomes the first of a career of its own. The career
-- borrows the Season's id, which is unique already.
insert into public.careers (id, manager_id, seed, created_at)
select id, manager_id, seed, created_at from public.seasons;

update public.seasons
set career_id = id,
    -- Seasons stored before #85 have no `year`: they are the first of their run.
    year = coalesce((state ->> 'year')::integer, 1);

alter table public.seasons
  alter column career_id set not null,
  alter column year set not null,
  -- Null once the next Season exists: only the current Season holds a state.
  alter column state drop not null;

drop index public.seasons_one_per_manager;
alter table public.seasons drop column manager_id;

create unique index seasons_by_career on public.seasons (career_id, year);

-- A Player's part of one Season's record. Each part may be empty, so that the
-- round trip loses nothing (ADR-029).
create table public.player_seasons (
  career_id uuid not null references public.careers (id) on delete cascade,
  year integer not null,
  player_id text not null,
  -- Whose counts these are: a Goalie's, or a Skater's.
  goalie boolean not null,
  -- From the Roster as the Season ended, and the place in it, null if not on it.
  roster_order integer,
  club_id text,
  age integer,
  position text,
  level double precision,
  -- Counts, folded from the stream (D-03).
  regular jsonb,
  playoffs jsonb,
  primary key (career_id, player_id, year)
);

create index player_seasons_by_year on public.player_seasons (career_id, year);

-- Who a Player is, apart from his ability (D-11).
create table public.players (
  career_id uuid not null references public.careers (id) on delete cascade,
  player_id text not null,
  first_name text not null,
  last_name text not null,
  goalie boolean not null,
  primary key (career_id, player_id)
);

alter table public.careers enable row level security;
alter table public.player_seasons enable row level security;
alter table public.players enable row level security;
