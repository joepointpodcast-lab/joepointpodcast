-- =====================================================================
--  Joe Point Podcast — update: image descriptions (alt text) + focus keyphrase
--  Run this ONCE in Supabase → SQL Editor → New query → Run
--  (BEFORE uploading the new website files to GitHub). Safe to run more than once.
-- =====================================================================

-- Description of the main image (read by Google and by screen readers for blind visitors)
alter table public.episodes add column if not exists cover_alt text not null default '';
alter table public.posts    add column if not exists image_alt text not null default '';
alter table public.guests   add column if not exists photo_alt text not null default '';

-- Description per gallery photo (the caption is what visitors see; the alt text is for Google)
alter table public.post_images add column if not exists alt text not null default '';

-- Focus keyphrase: the search words this page should be found on (a writing aid in the admin)
alter table public.episodes add column if not exists focus_keyphrase text not null default '';
alter table public.posts    add column if not exists focus_keyphrase text not null default '';
alter table public.guests   add column if not exists focus_keyphrase text not null default '';

-- Same for the books (only if the books update is installed)
do $$ begin
  if to_regclass('public.books') is not null then
    alter table public.books add column if not exists cover_alt text not null default '';
    alter table public.books add column if not exists focus_keyphrase text not null default '';
  end if;
  if to_regclass('public.book_images') is not null then
    alter table public.book_images add column if not exists alt text not null default '';
  end if;
end $$;

notify pgrst, 'reload schema';
