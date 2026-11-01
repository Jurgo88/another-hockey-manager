-- Guards against two advances of one Season running at once.
alter table public.seasons add column version integer not null default 0;
