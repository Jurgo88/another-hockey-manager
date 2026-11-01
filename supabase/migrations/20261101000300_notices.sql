-- What a Manager is told, folded from the Fixtures played. `kind` picks the
-- wording, and `data` holds what that kind needs, so new kinds need no migration.
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  day integer not null,
  kind text not null,
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notices_by_season on public.notices (season_id, created_at desc);

alter table public.notices enable row level security;
