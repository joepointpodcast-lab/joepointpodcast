-- Joe Point Podcast — SEO (topics + Google) AND visitor statistics in one go.
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
