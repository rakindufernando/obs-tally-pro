-- BUMBI 2.0 source selection and OBS statistics
alter table public.productions add column if not exists obs_sources jsonb not null default '[]'::jsonb;
alter table public.productions add column if not exists obs_stats jsonb not null default '{}'::jsonb;
alter table public.productions add column if not exists obs_stats_at timestamptz;
