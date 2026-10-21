-- Joe Point Podcast — ALL new updates in one go: Google (SEO), visitor statistics and the books (hidden until you switch them on).
-- Run ONCE in Supabase → SQL Editor → Run, BEFORE uploading the files to GitHub. Safe to run more than once.

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

-- =====================================================================
--  Joe Point Podcast — update: visitor statistics
--  Run this ONCE in Supabase → SQL Editor → New query → Run
--  (BEFORE uploading the new website files to GitHub). Safe to run more than once.
--
--  Privacy: no names, no cookies, no IP addresses are stored. Only: which page,
--  when, where the visitor came from (Facebook, Google…) and phone/computer.
--  (For spam protection a one-way scrambled code of the IP + date is kept for max. 1 day.)
-- =====================================================================

create table if not exists public.page_views (
  id        bigint generated always as identity primary key,
  ts        timestamptz not null default now(),
  path      text not null check (char_length(path) between 1 and 200),
  source    text not null default 'direct' check (char_length(source) <= 40),
  device    text not null default 'computer' check (device in ('phone','tablet','computer')),
  new_visit boolean not null default false
);
create index if not exists page_views_ts_idx   on public.page_views (ts desc);
create index if not exists page_views_path_idx on public.page_views (path, ts desc);

alter table public.page_views enable row level security;
drop policy if exists page_views_admin_read on public.page_views;
create policy page_views_admin_read on public.page_views for select using (public.is_admin());
revoke insert, update, delete on public.page_views from anon, authenticated;

-- Count one page view (called by the website; visitors can't write to the table directly)
create or replace function public.track_view(p_path text, p_source text default 'direct', p_device text default 'computer', p_new boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_key text := 'v:' || md5(public._client_ip() || current_date::text || 'jp-stats');
  v_path text := left(regexp_replace(coalesce(p_path, '/'), '[?#].*$', ''), 200);
begin
  if v_path !~ '^/' or v_path ~ '^/admin' then return; end if;
  -- spam protection: max. 300 views per hour from the same connection (silently ignored above that)
  if (select count(*) from public.rate_limits where ip = v_key and action = 'view' and ts > now() - interval '1 hour') >= 300 then return; end if;
  insert into public.rate_limits (ip, action) values (v_key, 'view');
  insert into public.page_views (path, source, device, new_visit)
  values (v_path,
          coalesce(nullif(left(lower(regexp_replace(coalesce(p_source, ''), '[^a-zA-Z0-9.\-]', '', 'g')), 40), ''), 'direct'),
          case when p_device in ('phone','tablet','computer') then p_device else 'computer' end,
          coalesce(p_new, false));
  -- housekeeping (now and then): spam codes older than a day, views older than 2 years
  if random() < 0.01 then
    delete from public.rate_limits where ts < now() - interval '1 day';
    delete from public.page_views where ts < now() - interval '2 years';
  end if;
end $$;
grant execute on function public.track_view(text,text,text,boolean) to anon, authenticated;

-- All numbers for the admin dashboard in one go (only for the admin)
create or replace function public.visitor_stats(p_days int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'Europe/Amsterdam';
  v_days int := least(greatest(coalesce(p_days, 30), 1), 366);
  v_from timestamptz := date_trunc('day', now() at time zone tz) at time zone tz - make_interval(days => v_days - 1);
  v_today timestamptz := date_trunc('day', now() at time zone tz) at time zone tz;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return json_build_object(
    'days', v_days,
    'totals', (select json_build_object(
        'today_views',  count(*) filter (where ts >= v_today),
        'today_visits', count(*) filter (where ts >= v_today and new_visit),
        'week_views',   count(*) filter (where ts >= v_today - interval '6 days'),
        'week_visits',  count(*) filter (where ts >= v_today - interval '6 days' and new_visit),
        'period_views', count(*) filter (where ts >= v_from),
        'period_visits',count(*) filter (where ts >= v_from and new_visit),
        'prev_visits',  count(*) filter (where ts >= v_from - make_interval(days => v_days) and ts < v_from and new_visit),
        'all_views',    count(*),
        'all_visits',   count(*) filter (where new_visit),
        'since',        min(ts)) from public.page_views),
    'daily', (select coalesce(json_agg(json_build_object('day', d::date, 'views', coalesce(x.views, 0), 'visits', coalesce(x.visits, 0)) order by d), '[]'::json)
        from generate_series((v_from at time zone tz)::date, (now() at time zone tz)::date, interval '1 day') d
        left join (select (ts at time zone tz)::date as d_day, count(*) views, count(*) filter (where new_visit) visits
                   from public.page_views where ts >= v_from group by 1) x on x.d_day = d::date),
    'pages', (select coalesce(json_agg(t), '[]'::json) from (
        select path, count(*) views from public.page_views where ts >= v_from group by path order by views desc, path limit 15) t),
    'sources', (select coalesce(json_agg(t), '[]'::json) from (
        select source, count(*) visits from public.page_views where ts >= v_from and new_visit group by source order by visits desc limit 10) t),
    'devices', (select coalesce(json_agg(t), '[]'::json) from (
        select device, count(*) visits from public.page_views where ts >= v_from and new_visit group by device order by visits desc) t)
  );
end $$;
revoke execute on function public.visitor_stats(int) from public, anon;
grant execute on function public.visitor_stats(int) to authenticated;

-- Views of one page (for the "👁 87 views" in the gold bar; only for the admin)
create or replace function public.page_view_count(p_path text)
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return (select json_build_object('total', count(*), 'week', count(*) filter (where ts > now() - interval '7 days'))
          from public.page_views where path = p_path);
end $$;
revoke execute on function public.page_view_count(text) from public, anon;
grant execute on function public.page_view_count(text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
--  Joe Point Podcast — update: The Books (book series)
--  Run this ONCE in Supabase → SQL Editor → New query → Run
--  (BEFORE uploading the new website files to GitHub). Safe to run more than once.
-- =====================================================================

create table if not exists public.books (
  id               bigint generated always as identity primary key,
  title            text not null,
  slug             text not null unique,
  subtitle         text not null default '',
  series_no        int,
  status           text not null default 'soon' check (status in ('draft','soon','preorder','available')),
  release_date     date,
  cover            text,                       -- path in bucket "media"
  blurb            text not null default '',   -- 1-3 sentences (cards, Google, share previews)
  description      text not null default '',   -- the long text about the book (Markdown)
  excerpt          text not null default '',   -- sneak preview: an excerpt from the book (Markdown)
  sample_audio     text,                       -- sneak preview audio file in "media"
  sample_url       text not null default '',   -- or a link (YouTube, Spotify, SoundCloud…)
  link_kindle      text not null default '',
  link_paperback   text not null default '',
  link_hardcover   text not null default '',
  link_audiobook   text not null default '',
  link_spotify     text not null default '',
  link_other       text not null default '',
  link_other_label text not null default '',
  tags             text[] not null default '{}',
  seo_title        text not null default '',
  seo_description  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.book_images (
  id      bigint generated always as identity primary key,
  book_id bigint not null references public.books(id) on delete cascade,
  file    text not null,
  caption text not null default '',
  sort    int  not null default 0
);

-- "Tell me when it's out": WhatsApp numbers (only the admin can read them)
create table if not exists public.book_signups (
  id         bigint generated always as identity primary key,
  book_id    bigint references public.books(id) on delete set null,
  phone      text not null check (phone ~ '^\+[0-9]{8,15}$'),
  name       text not null default '' check (char_length(name) <= 80),
  created_at timestamptz not null default now()
);
-- (in case an older test version with email addresses was installed)
alter table public.book_signups add column if not exists phone text;
alter table public.book_signups add column if not exists name text not null default '';
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'book_signups' and column_name = 'email') then
    alter table public.book_signups alter column email drop not null;
  end if;
end $$;
drop index if exists public.book_signups_uniq;
create unique index if not exists book_signups_phone_uniq on public.book_signups (phone, coalesce(book_id, 0));
create index if not exists books_order_idx on public.books (series_no, release_date);
create index if not exists books_tags_idx  on public.books using gin (tags);

alter table public.books        enable row level security;
alter table public.book_images  enable row level security;
alter table public.book_signups enable row level security;

-- The whole books section can be switched off in the admin (Settings key books_enabled = '1' means ON).
-- While it is OFF, visitors can't see ANY book — not on the site and not via the database.
create or replace function public.books_on()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.settings where key = 'books_enabled' and value = '1');
$$;
grant execute on function public.books_on() to anon, authenticated;

-- Book texts in Settings (keys starting with "book") stay hidden too while the section is off
drop policy if exists "lezen" on public.settings;
create policy "lezen" on public.settings for select using (key not like 'book%' or key = 'books_enabled' or public.books_on() or public.is_admin());

drop policy if exists "lezen" on public.books;
create policy "lezen" on public.books for select using ((status <> 'draft' and public.books_on()) or public.is_admin());
drop policy if exists "beheer" on public.books;
create policy "beheer" on public.books for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lezen" on public.book_images;
create policy "lezen" on public.book_images for select using (exists (select 1 from public.books b where b.id = book_id));
drop policy if exists "beheer" on public.book_images;
create policy "beheer" on public.book_images for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "beheer" on public.book_signups;
create policy "beheer" on public.book_signups for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke insert, update, delete on public.books, public.book_images, public.book_signups from anon;

-- Visitors sign up with their WhatsApp number via this function (spam filter + limit per connection)
drop function if exists public.book_signup(text, bigint, text);
create or replace function public.book_signup(p_phone text, p_name text default '', p_book bigint default null, p_consent boolean default false, p_hp text default '')
returns void language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
begin
  if coalesce(p_hp, '') <> '' then return; end if;
  if v_phone like '00%' then v_phone := '+' || substr(v_phone, 3); end if;
  if v_phone !~ '^\+[0-9]{8,15}$' then
    raise exception 'Please enter your WhatsApp number with country code, e.g. +31 6 12345678 or +220 123 4567.' using errcode = 'P0001';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Please tick the box so we may send you a WhatsApp message.' using errcode = 'P0001';
  end if;
  if not public.books_on() then raise exception 'Not available.' using errcode = 'P0001'; end if;
  perform public._rate_limit('book_signup', 5, interval '1 hour');
  insert into public.book_signups (phone, name, book_id)
  values (v_phone, left(trim(coalesce(p_name, '')), 80), (select id from public.books where id = p_book and status <> 'draft'))
  on conflict do nothing;
end $$;
grant execute on function public.book_signup(text, text, bigint, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';
