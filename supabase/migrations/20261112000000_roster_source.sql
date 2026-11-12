-- Which Rosters a career began on (ADR-003 and ADR-029 amendments, #115). Every
-- career stored before began on generated ones.
alter table public.careers
  add column roster_source text not null default 'generated'
    check (roster_source in ('generated', 'file'));
