-- =====================================================================
--  Joe Point Podcast — update to English
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  * Messages shown to visitors (errors in the forms) become English.
--  * Texts that were still the original Dutch example text become English.
--    Anything Lamin already changed himself is left untouched.
--  Safe to run more than once.
-- =====================================================================

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


-- ---------- English example texts (only if still the untouched Dutch version) ----------
update public.settings set value = 'Real stories. Open conversations. From The Gambia to the world.' where key = 'tagline' and value = 'Echte verhalen. Open gesprekken. Van Gambia tot Nederland.';
update public.settings set value = 'Welcome to Joe Point' where key = 'intro_title' and value = 'Welkom bij Joe Point';
update public.settings set value = E'Joe Point is the podcast of Lamin. We talk about life, culture, business, family and everything in between – with guests who have something to say.\n\nPut your headphones on and listen in.' where key = 'intro_text' and value = E'Joe Point is de podcast van Lamin. Hier praten we over het leven, cultuur, ondernemen, familie en alles wat daartussen zit – met gasten die iets te vertellen hebben.\n\nZet je koptelefoon op en luister mee.';
update public.settings set value = 'Host of Joe Point Podcast. Born in The Gambia, at home in the Netherlands.' where key = 'host_intro' and value = 'Host van Joe Point Podcast. Geboren in Gambia, thuis in Nederland.';
update public.settings set value = 'Tell people who you are: where you grew up, what you do and what drives you.' where key = 'host_bio' and value = 'Vertel hier wie je bent: waar je bent opgegroeid, wat je doet en wat je drijft.';
update public.settings set value = 'Why this podcast? Tell people how the idea started and what you want your listeners to take away.' where key = 'host_why' and value = 'Waarom deze podcast? Vertel hier hoe het idee ontstond en wat je luisteraars wilt meegeven.';
update public.settings set value = 'Your background: The Gambia, the move to the Netherlands, work, family, and the moments that shaped you.' where key = 'host_background' and value = 'Je achtergrond: Gambia, de stap naar Nederland, werk, familie, en de momenten die je hebben gevormd.';
update public.settings set value = 'Our mission: giving a voice to stories you would not hear otherwise, and bringing people together.' where key = 'host_mission' and value = 'Onze missie: verhalen een stem geven die je anders niet hoort, en mensen met elkaar verbinden.';
update public.settings set value = 'A question, a collaboration, or want to be a guest yourself? Let us know!' where key = 'contact_intro' and value = 'Een vraag, samenwerking of wil je zelf te gast zijn? Laat het weten!';
update public.settings set value = 'What is one lesson from your childhood that you still use every day?' where key = 'question_of_week' and value = 'Wat is één les uit je jeugd die je nog elke dag gebruikt?';
update public.settings set value = 'Everyone has a story. Whether you are from The Gambia, live in the diaspora or simply want to share something – send in your story and a photo. Once approved, it will appear here.' where key = 'stories_intro' and value = 'Iedereen heeft een verhaal. Of je nu uit Gambia komt, in de diaspora woont of gewoon iets wilt delen – stuur je verhaal en een foto in. Na goedkeuring verschijnt het hier.';
update public.settings set value = 'Joe Point Podcast — made with love, from Banjul to the world.' where key = 'footer_text' and value = 'Joe Point Podcast — gemaakt met liefde, van Banjul tot Nederland.';
update public.categories set name = 'Life & Culture', slug = 'life-and-culture' where slug = 'leven-en-cultuur' and name = 'Leven & Cultuur' and not exists (select 1 from public.categories where slug = 'life-and-culture');
update public.categories set name = 'Business', slug = 'business' where slug = 'ondernemen' and name = 'Ondernemen' and not exists (select 1 from public.categories where slug = 'business');
update public.categories set name = 'Gambia & Diaspora', slug = 'gambia-and-diaspora' where slug = 'gambia-en-diaspora' and name = 'Gambia & Diaspora' and not exists (select 1 from public.categories where slug = 'gambia-and-diaspora');
update public.categories set name = 'Family & Relationships', slug = 'family-and-relationships' where slug = 'familie-en-relaties' and name = 'Familie & Relaties' and not exists (select 1 from public.categories where slug = 'family-and-relationships');
update public.categories set name = 'Health & Mindset', slug = 'health-and-mindset' where slug = 'gezondheid-en-mindset' and name = 'Gezondheid & Mindset' and not exists (select 1 from public.categories where slug = 'health-and-mindset');
update public.episodes set title = 'Episode 1 — Where it all began', slug = 'episode-1-where-it-all-began',
  excerpt = 'In the very first episode Lamin talks about growing up in The Gambia, moving to the Netherlands and why he started Joe Point.', shownotes = E'## In this episode\n\n- Growing up in The Gambia\n- The first years in the Netherlands\n- Why a podcast?\n\n## Timestamps\n\n- 00:00 Intro\n- 03:15 Childhood in The Gambia\n- 18:40 Moving to the Netherlands\n- 34:10 The idea behind Joe Point\n\n*This is an example episode – edit it or delete it in the admin.*'
  where slug = 'aflevering-1-waar-het-allemaal-begon' and title = 'Aflevering 1 — Waar het allemaal begon';
update public.guests set name = 'Example guest', slug = 'example-guest', tagline = 'Entrepreneur & storyteller', bio = 'This is an example guest. Change the name, bio, photo and socials in the admin under **Guests**, or delete this guest.'
  where slug = 'voorbeeldgast' and bio = 'Dit is een voorbeeldgast. Pas de naam, bio, foto en socials aan in het beheerscherm onder **Gasten**, of verwijder deze gast.';
update public.posts set excerpt = 'The Joe Point website is online. Here you will find all episodes, guests, news and stories from the community.', body = E'The Joe Point website is online! Here you will find:\n\n- All episodes with show notes\n- The guests who joined us\n- Stories from the community\n\nIs there a topic you would love to hear? Let us know via **Get involved**.'
  where slug = 'joe-point-podcast-is-live' and excerpt = 'De website van Joe Point is online. Hier vind je alle afleveringen, gasten, nieuws en verhalen uit de community.';
update public.stories set name = 'Example', location = 'Serekunda, The Gambia', title = 'An example story', body = 'This is what an approved community story looks like. Listeners send in their story and photo using the form; Lamin approves it in the admin before it appears here.'
  where title = 'Een voorbeeldverhaal' and body = 'Zo ziet een goedgekeurd community-verhaal eruit. Luisteraars sturen hun verhaal en foto in via het formulier; Lamin keurt het goed in het beheerscherm voordat het hier verschijnt.';
