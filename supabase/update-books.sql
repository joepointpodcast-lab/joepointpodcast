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
