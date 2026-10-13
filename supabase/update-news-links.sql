-- =====================================================================
--  Joe Point Podcast — update: links on news posts
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  Safe to run more than once.
-- =====================================================================

-- News posts can link to an episode and/or to another page (Facebook, Instagram, YouTube…)
alter table public.posts add column if not exists episode_id bigint references public.episodes(id) on delete set null;
alter table public.posts add column if not exists link_url   text not null default '';
alter table public.posts add column if not exists link_label text not null default '';

-- New news posts are live by default
alter table public.posts alter column status set default 'published';

-- Put news posts that were accidentally left as draft live
update public.posts set status = 'published' where status = 'draft';

-- Let the API know about the new columns right away
notify pgrst, 'reload schema';
