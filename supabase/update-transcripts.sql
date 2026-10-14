-- =====================================================================
--  Joe Point Podcast — update: transcript + highlights per episode
--  Run this ONCE in Supabase → SQL Editor → New query → Run
--  (BEFORE uploading the new website files to GitHub). Safe to run more than once.
-- =====================================================================

alter table public.episodes add column if not exists transcript text not null default '';
alter table public.episodes add column if not exists clips      text not null default '';

-- New episodes are live by default
alter table public.episodes alter column status set default 'published';

-- Let the API know about the new columns right away
notify pgrst, 'reload schema';
