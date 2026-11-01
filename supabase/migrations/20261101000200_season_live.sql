-- A followed Fixture steps about once a second, so its progress sits apart from
-- the Season state, which is far too large to rewrite that often.
alter table public.seasons add column live json not null default '{}';
