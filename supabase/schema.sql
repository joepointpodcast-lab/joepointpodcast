-- =====================================================================
--  Joe Point Podcast — Supabase database
--  Plak dit hele bestand in Supabase → SQL Editor → Run.
--  Daarna onderaan je eigen e-mailadres invullen bij "BEHEERDER".
-- =====================================================================

-- ---------- Beheerders ----------
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;  -- geen policies: niemand kan dit lezen via de API

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ---------- Tabellen ----------
create table if not exists public.settings (
  key   text primary key,
  value text not null default ''
);

create table if not exists public.categories (
  id   bigint generated always as identity primary key,
  name text not null,
  slug text not null unique,
  sort int  not null default 0
);

create table if not exists public.episodes (
  id           bigint generated always as identity primary key,
  title        text not null,
  slug         text not null unique,
  number       int,
  season       int,
  excerpt      text not null default '',
  shownotes    text not null default '',
  cover        text,          -- pad in bucket "media"
  audio        text,          -- pad in bucket "media"
  media_url    text not null default '',
  duration     text not null default '',
  category_id  bigint references public.categories(id) on delete set null,
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Transcript + highlights (also added by update-transcripts.sql)
alter table public.episodes add column if not exists transcript text not null default '';
alter table public.episodes add column if not exists clips      text not null default '';
alter table public.episodes alter column status set default 'published';

create table if not exists public.guests (
  id         bigint generated always as identity primary key,
  name       text not null,
  slug       text not null unique,
  tagline    text not null default '',
  bio        text not null default '',
  photo      text,
  website    text not null default '',
  instagram  text not null default '',
  tiktok     text not null default '',
  youtube    text not null default '',
  facebook   text not null default '',
  x          text not null default '',
  linkedin   text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.episode_guests (
  episode_id bigint not null references public.episodes(id) on delete cascade,
  guest_id   bigint not null references public.guests(id) on delete cascade,
  primary key (episode_id, guest_id)
);

create table if not exists public.posts (
  id           bigint generated always as identity primary key,
  title        text not null,
  slug         text not null unique,
  type         text not null default 'nieuws' check (type in ('nieuws','update','gast','fotos')),
  excerpt      text not null default '',
  body         text not null default '',
  image        text,
  status       text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Links on news posts (episode and/or external page) — also added by update-news-links.sql
alter table public.posts add column if not exists episode_id bigint references public.episodes(id) on delete set null;
alter table public.posts add column if not exists link_url   text not null default '';
alter table public.posts add column if not exists link_label text not null default '';
alter table public.posts alter column status set default 'published';

create table if not exists public.post_images (
  id      bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  file    text not null,
  caption text not null default '',
  sort    int  not null default 0
);

create table if not exists public.stories (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 80),
  location    text not null default '' check (char_length(location) <= 80),
  title       text not null check (char_length(title) between 1 and 140),
  body        text not null check (char_length(body) between 1 and 8000),
  upload_path text,          -- originele foto in privé-bucket "inbox"
  photo       text,          -- openbare foto in "media" (pas na goedkeuring)
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note  text not null default '',
  created_at  timestamptz not null default now(),
  approved_at timestamptz
);

create table if not exists public.submissions (
  id           bigint generated always as identity primary key,
  type         text not null check (type in ('question','voice','topic','contact')),
  name         text not null default '' check (char_length(name) <= 80),
  subject      text not null default '' check (char_length(subject) <= 140),
  message      text not null default '' check (char_length(message) <= 5000),
  question     text not null default '',
  upload_path  text,         -- audio in privé-bucket "inbox"
  public_audio text,         -- kopie in "media" als Lamin het op de site zet
  is_public    boolean not null default false,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);

-- E-mailadressen van inzenders apart en alleen zichtbaar voor beheerders
create table if not exists public.private_contacts (
  kind   text   not null check (kind in ('story','submission')),
  ref_id bigint not null,
  email  text   not null,
  primary key (kind, ref_id)
);

create table if not exists public.rate_limits (
  ip     text not null,
  action text not null,
  ts     timestamptz not null default now()
);

-- Tags + Google fields (also added by update-seo.sql)
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

create index if not exists episodes_pub_idx    on public.episodes (status, published_at desc);
create index if not exists posts_pub_idx       on public.posts (status, published_at desc);
create index if not exists stories_status_idx  on public.stories (status, created_at desc);
create index if not exists submissions_idx     on public.submissions (is_read, created_at desc);
create index if not exists rate_limits_idx     on public.rate_limits (ip, action, ts);

-- ---------- Row Level Security ----------
alter table public.settings          enable row level security;
alter table public.categories        enable row level security;
alter table public.episodes          enable row level security;
alter table public.guests            enable row level security;
alter table public.episode_guests    enable row level security;
alter table public.posts             enable row level security;
alter table public.post_images       enable row level security;
alter table public.stories           enable row level security;
alter table public.submissions       enable row level security;
alter table public.private_contacts  enable row level security;
alter table public.rate_limits       enable row level security;

-- Iedereen mag lezen wat publiek is; alleen de beheerder mag schrijven
do $$
declare t text;
begin
  foreach t in array array['settings','categories','guests','episode_guests','post_images'] loop
    execute format('drop policy if exists "lezen" on public.%I', t);
    execute format('create policy "lezen" on public.%I for select using (true)', t);
    execute format('drop policy if exists "beheer" on public.%I', t);
    execute format('create policy "beheer" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  foreach t in array array['episodes','posts'] loop
    execute format('drop policy if exists "lezen" on public.%I', t);
    execute format($p$create policy "lezen" on public.%I for select using ((status = 'published' and published_at <= now()) or public.is_admin())$p$, t);
    execute format('drop policy if exists "beheer" on public.%I', t);
    execute format('create policy "beheer" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists "lezen" on public.stories;
create policy "lezen" on public.stories for select using (status = 'approved' or public.is_admin());
drop policy if exists "beheer" on public.stories;
create policy "beheer" on public.stories for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "lezen" on public.submissions;
create policy "lezen" on public.submissions for select using (is_public or public.is_admin());
drop policy if exists "beheer" on public.submissions;
create policy "beheer" on public.submissions for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "beheer" on public.private_contacts;
create policy "beheer" on public.private_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- rate_limits: geen policies → alleen via de functies hieronder

-- Bezoekers schrijven nooit rechtstreeks in tabellen, alleen via de functies hieronder
revoke insert, update, delete on all tables in schema public from anon;

-- ---------- Inzendingen van bezoekers (met spam- en limietcontrole) ----------
create or replace function public._client_ip()
returns text language sql stable as $$
  select coalesce(
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    'onbekend');
$$;

create or replace function public._rate_limit(p_action text, p_max int, p_window interval)
returns void language plpgsql security definer set search_path = public as $$
declare v_ip text := public._client_ip();
begin
  delete from public.rate_limits where ts < now() - interval '1 day';
  if (select count(*) from public.rate_limits where ip = v_ip and action = p_action and ts > now() - p_window) >= p_max then
    raise exception 'You have already sent a few submissions. Please try again later.' using errcode = 'P0001';
  end if;
  insert into public.rate_limits (ip, action) values (v_ip, p_action);
end $$;

create or replace function public._check_upload(p_path text, p_folder text)
returns void language plpgsql security definer set search_path = public, storage as $$
begin
  if p_path is null then return; end if;
  if p_path !~ ('^' || p_folder || '/[0-9a-f-]{36}\.[a-z0-9]{2,5}$') then
    raise exception 'Invalid file.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'inbox' and name = p_path) then
    raise exception 'File not found. Please try uploading again.' using errcode = 'P0001';
  end if;
end $$;

create or replace function public.submit_story(
  p_name text, p_location text, p_email text, p_title text, p_body text,
  p_upload_path text, p_consent boolean, p_hp text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if coalesce(p_hp, '') <> '' then return; end if;                 -- honeypot: stil negeren
  if not coalesce(p_consent, false) then
    raise exception 'Please give permission to publish your story.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_name,''))) = 0 or char_length(trim(coalesce(p_title,''))) = 0 or char_length(trim(coalesce(p_body,''))) < 30 then
    raise exception 'Please fill in your name, a title and your story (at least a few sentences).' using errcode = 'P0001';
  end if;
  if coalesce(p_email,'') <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = 'P0001';
  end if;
  perform public._rate_limit('story', 3, interval '1 hour');
  perform public._check_upload(p_upload_path, 'stories');

  insert into public.stories (name, location, title, body, upload_path)
  values (left(trim(p_name), 80), left(trim(coalesce(p_location,'')), 80), left(trim(p_title), 140), left(trim(p_body), 8000), p_upload_path)
  returning id into v_id;

  if coalesce(p_email,'') <> '' then
    insert into public.private_contacts (kind, ref_id, email) values ('story', v_id, left(trim(p_email), 200));
  end if;
end $$;

create or replace function public.submit_message(
  p_type text, p_name text, p_email text, p_subject text, p_message text,
  p_upload_path text default null, p_hp text default ''
) returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_q text := '';
begin
  if coalesce(p_hp, '') <> '' then return; end if;
  if p_type not in ('question','voice','topic','contact') then
    raise exception 'Unknown form.' using errcode = 'P0001';
  end if;
  if coalesce(p_email,'') <> '' and p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.' using errcode = 'P0001';
  end if;
  if p_type = 'voice' and p_upload_path is null then
    raise exception 'Record a message or choose an audio file.' using errcode = 'P0001';
  end if;
  if p_type = 'topic' and trim(coalesce(p_subject,'')) = '' then
    raise exception 'Please fill in a topic.' using errcode = 'P0001';
  end if;
  if p_type = 'contact' and (trim(coalesce(p_name,'')) = '' or coalesce(p_email,'') = '' or trim(coalesce(p_message,'')) = '') then
    raise exception 'Please fill in your name, email address and message.' using errcode = 'P0001';
  end if;
  if p_type = 'question' and trim(coalesce(p_message,'')) = '' and p_upload_path is null then
    raise exception 'Your answer is still empty.' using errcode = 'P0001';
  end if;
  if p_type in ('topic','contact') and p_upload_path is not null then
    raise exception 'Attachments are not possible here.' using errcode = 'P0001';
  end if;

  perform public._rate_limit('msg_' || p_type, 6, interval '1 hour');
  perform public._check_upload(p_upload_path, 'voice');

  if p_type = 'question' then
    select value into v_q from public.settings where key = 'question_of_week';
  end if;

  insert into public.submissions (type, name, subject, message, question, upload_path)
  values (p_type, left(trim(coalesce(p_name,'')), 80), left(trim(coalesce(p_subject,'')), 140),
          left(trim(coalesce(p_message,'')), 5000), coalesce(v_q, ''), p_upload_path)
  returning id into v_id;

  if coalesce(p_email,'') <> '' then
    insert into public.private_contacts (kind, ref_id, email) values ('submission', v_id, left(trim(p_email), 200));
  end if;
end $$;

revoke all on function public.submit_story(text,text,text,text,text,text,boolean,text) from public;
revoke all on function public.submit_message(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_story(text,text,text,text,text,text,boolean,text) to anon, authenticated;
grant execute on function public.submit_message(text,text,text,text,text,text,text) to anon, authenticated;
revoke all on function public._rate_limit(text,int,interval) from public, anon, authenticated;
revoke all on function public._check_upload(text,text) from public, anon, authenticated;

-- Houdt de gratis database wakker (aangeroepen door Netlify, elke dag)
create or replace function public.ping()
returns text language sql stable as $$ select 'pong'::text $$;
grant execute on function public.ping() to anon;

-- ---------- Opslag (foto's en audio) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true,  52428800, array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/webm']),
  ('inbox', 'inbox', false, 12582912, array['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/ogg','audio/wav','audio/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media beheer"       on storage.objects;
drop policy if exists "inbox insturen"     on storage.objects;
drop policy if exists "inbox beheer lezen" on storage.objects;
drop policy if exists "inbox beheer wissen" on storage.objects;

-- media: openbaar te bekijken (public bucket), alleen de beheerder uploadt/wist
create policy "media beheer" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- inbox: bezoekers mogen alleen nieuwe bestanden toevoegen (niet lezen, niet overschrijven)
create policy "inbox insturen" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'inbox' and (storage.foldername(name))[1] in ('stories','voice'));
create policy "inbox beheer lezen" on storage.objects for select to authenticated
  using (bucket_id = 'inbox' and public.is_admin());
create policy "inbox beheer wissen" on storage.objects for delete to authenticated
  using (bucket_id = 'inbox' and public.is_admin());

-- ---------- Startinhoud ----------
insert into public.settings (key, value) values
  ('site_title', 'Joe Point Podcast'),
  ('tagline', 'Real stories. Open conversations. From The Gambia to the world.'),
  ('intro_title', 'Welcome to Joe Point'),
  ('intro_text', E'Joe Point is the podcast of Lamin. We talk about life, culture, business, family and everything in between – with guests who have something to say.\n\nPut your headphones on and listen in.'),
  ('hero_image', ''), ('logo', ''),
  ('host_name', 'Lamin'), ('host_photo', ''),
  ('host_intro', 'Host of Joe Point Podcast. Born in The Gambia, at home in the Netherlands.'),
  ('host_bio', 'Tell people who you are: where you grew up, what you do and what drives you.'),
  ('host_why', 'Why this podcast? Tell people how the idea started and what you want your listeners to take away.'),
  ('host_background', 'Your background: The Gambia, the move to the Netherlands, work, family, and the moments that shaped you.'),
  ('host_mission', 'Our mission: giving a voice to stories you would not hear otherwise, and bringing people together.'),
  ('contact_email', ''),
  ('contact_intro', 'A question, a collaboration, or want to be a guest yourself? Let us know!'),
  ('question_of_week', 'What is one lesson from your childhood that you still use every day?'),
  ('question_active', '1'),
  ('stories_intro', 'Everyone has a story. Whether you are from The Gambia, live in the diaspora or simply want to share something – send in your story and a photo. Once approved, it will appear here.'),
  ('social_spotify', ''), ('social_apple', ''), ('social_youtube', ''), ('social_instagram', ''),
  ('social_tiktok', ''), ('social_facebook', ''), ('social_x', ''), ('social_linkedin', ''), ('social_whatsapp', ''),
  ('footer_text', 'Joe Point Podcast — made with love, from Banjul to the world.'),
  ('theme_mode', 'dark'), ('color_bg', '#0d0b0a'), ('color_primary', '#f5a524'),
  ('color_accent', '#ff6a1a'), ('color_accent2', '#ffd27a'), ('font_display', 'anton')
on conflict (key) do nothing;

insert into public.categories (name, slug, sort) values
  ('Life & Culture', 'life-and-culture', 0),
  ('Business', 'business', 1),
  ('Gambia & Diaspora', 'gambia-and-diaspora', 2),
  ('Family & Relationships', 'family-and-relationships', 3),
  ('Health & Mindset', 'health-and-mindset', 4)
on conflict (slug) do nothing;

do $$
declare g bigint; e bigint;
begin
  if not exists (select 1 from public.episodes) then
    insert into public.guests (name, slug, tagline, bio)
    values ('Example guest', 'example-guest', 'Entrepreneur & storyteller',
            'This is an example guest. Change the name, bio, photo and socials in the admin under **Guests**, or delete this guest.')
    returning id into g;

    insert into public.episodes (title, slug, number, season, excerpt, shownotes, category_id, status, duration)
    values ('Episode 1 — Where it all began', 'episode-1-where-it-all-began', 1, 1,
      'In the very first episode Lamin talks about growing up in The Gambia, moving to the Netherlands and why he started Joe Point.',
      E'## In this episode\n\n- Growing up in The Gambia\n- The first years in the Netherlands\n- Why a podcast?\n\n## Timestamps\n\n- 00:00 Intro\n- 03:15 Childhood in The Gambia\n- 18:40 Moving to the Netherlands\n- 34:10 The idea behind Joe Point\n\n*This is an example episode – edit it or delete it in the admin.*',
      (select id from public.categories where slug = 'life-and-culture'), 'published', '45 min')
    returning id into e;
    insert into public.episode_guests values (e, g);

    insert into public.posts (title, slug, type, excerpt, body, status)
    values ('Joe Point Podcast is live!', 'joe-point-podcast-is-live', 'nieuws',
      'The Joe Point website is online. Here you will find all episodes, guests, news and stories from the community.',
      E'The Joe Point website is online! Here you will find:\n\n- All episodes with show notes\n- The guests who joined us\n- Stories from the community\n\nIs there a topic you would love to hear? Let us know via **Get involved**.',
      'published');

    insert into public.stories (name, location, title, body, status, approved_at)
    values ('Example', 'Serekunda, The Gambia', 'An example story',
      'This is what an approved community story looks like. Listeners send in their story and photo using the form; Lamin approves it in the admin before it appears here.',
      'approved', now());
  end if;
end $$;

-- =====================================================================
--  BEHEERDER — vul hier het e-mailadres in waarmee Lamin inlogt
--  (maak die gebruiker aan via Authentication → Users → Add user)
-- =====================================================================
insert into public.admins (email) values ('VUL-HIER-HET-EMAILADRES-IN@voorbeeld.nl')
on conflict do nothing;
