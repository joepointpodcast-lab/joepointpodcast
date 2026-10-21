-- =====================================================================
--  Joe Point Podcast — update: tags + Google (SEO) fields
--  Run this ONCE in Supabase → SQL Editor → New query → Run
--  (BEFORE uploading the new website files to GitHub). Safe to run more than once.
-- =====================================================================

-- Tags (e.g. gambia, business, family) on episodes, guests and news posts
alter table public.episodes add column if not exists tags text[] not null default '{}';
alter table public.guests   add column if not exists tags text[] not null default '{}';
alter table public.posts    add column if not exists tags text[] not null default '{}';

-- Optional own title + description for Google (empty = the website fills them in itself)
alter table public.episodes add column if not exists seo_title       text not null default '';
alter table public.episodes add column if not exists seo_description text not null default '';
alter table public.guests   add column if not exists seo_title       text not null default '';
alter table public.guests   add column if not exists seo_description text not null default '';
alter table public.posts    add column if not exists seo_title       text not null default '';
alter table public.posts    add column if not exists seo_description text not null default '';

-- Fast lookup for the tag pages (/tag/…)
create index if not exists episodes_tags_idx on public.episodes using gin (tags);
create index if not exists guests_tags_idx   on public.guests   using gin (tags);
create index if not exists posts_tags_idx    on public.posts    using gin (tags);

-- Let the API know about the new columns right away
notify pgrst, 'reload schema';
