# Joe Point Podcast — website (Netlify + Supabase)

> **De website en het beheerscherm zijn in het Engels.** Deze handleiding is in het Nederlands, voor de installatie.
> Webadressen: `/episodes`, `/episode/…`, `/guests`, `/guest/…`, `/about`, `/news`, `/community`, `/community/share`, `/get-involved`, `/contact`, en het beheer op `/admin`.
> Oude Nederlandse adressen (zoals `/afleveringen` of `/doe-mee`) sturen automatisch door naar de nieuwe.

- **Netlify** host de website.
- **Supabase** regelt de database, de inlog voor Lamin en de opslag van foto's en audio.

Beide hebben een gratis plan. Pas als de podcast echt groot wordt, stap je over op een betaald plan met een vast bedrag.

```
site/                    de website (dit publiceert Netlify)
  index.html             publieke site
  admin/index.html       beheerscherm  →  jouwsite.nl/admin
  assets/js/config.js    ← HIER vul je de Supabase-gegevens in
netlify/
  functions/keepalive.mjs     houdt de gratis database elke dag wakker
  edge-functions/share.js     mooie previews bij delen via WhatsApp/Facebook/Google
  edge-functions/feed.js      RSS-feed op /feed
supabase/schema.sql      database, beveiliging en opslag in één keer
netlify.toml             Netlify-instellingen (niets aan veranderen)
```

---

## Installatie (± 20 minuten, eenmalig)

### 1. Supabase-project aanmaken
1. Ga naar supabase.com en klik op **New project**. Kies een regio in Europa (bijv. Frankfurt) en bewaar het databasewachtwoord goed.
2. Open `supabase/schema.sql` en vervang helemaal onderaan `VUL-HIER-HET-EMAILADRES-IN@voorbeeld.nl` door het e-mailadres waarmee Lamin gaat inloggen.
3. Ga in Supabase naar **SQL Editor → New query**, plak de hele inhoud van `schema.sql` en klik op **Run**.

   Hiermee worden alle tabellen, de beveiliging, de opslagmappen en de voorbeeldinhoud aangemaakt. Je kunt het later gerust nog een keer draaien: er gaat niets mee kapot.

### 2. Inlog voor Lamin
1. Ga naar **Authentication → Users → Add user → Create new user**.
2. Vul het e-mailadres uit stap 1.2 in, kies een wachtwoord en vink **Auto Confirm User** aan.
3. Ga naar **Authentication → Sign In / Providers** en zet **Allow new users to sign up** **uit**.

   Zo kan niemand anders een account aanmaken. Ook als dat toch zou gebeuren, krijgt zo'n account geen beheerrechten: alleen e-mailadressen in de tabel `admins` zijn beheerder.

### 3. Gegevens in de site zetten
1. Ga in Supabase naar **Project Settings → API Keys** (of de knop **Connect**).
2. Kopieer de **Project URL** en de **anon / publishable key**.
3. Plak ze in `site/assets/js/config.js`.

De anon key mag gewoon openbaar zijn: de database is beveiligd met Row Level Security. Gebruik **nooit** de `service_role` / secret key in de site.

### 4. Online zetten op Netlify
1. Zet deze map in een (privé) GitHub-repository.
2. Ga in Netlify naar **Add new site → Import an existing project → GitHub** en kies de repository.
3. De instellingen komen automatisch uit `netlify.toml`. Je hoeft geen build command in te vullen. Klik op **Deploy**.

> Gebruik niet de "slepen en neerzetten"-deploy. Daarbij worden de functies niet meegenomen, en die zorgen ervoor dat de database wakker blijft en dat delen mooi werkt.

### 5. Laatste koppeling
1. Ga in Supabase naar **Authentication → URL Configuration**.
2. Zet de **Site URL** op je Netlify-adres (bijv. `https://joepoint.netlify.app` of later je eigen domein).
3. Voeg bij **Redirect URLs** toe: `https://joepoint.netlify.app/admin/`

Dit is nodig voor "wachtwoord vergeten".

**Klaar!** Lamin logt in op `/admin`. Wil je een eigen domein? Dat koppel je in Netlify onder **Domain management**. Vergeet daarna niet stap 5 bij te werken.

---

## Bijwerken van de Nederlandse naar de Engelse versie

Draaide de site al in het Nederlands? Dan zijn er twee stappen nodig:

1. **Bestanden bijwerken in GitHub**: ga naar je repository, klik op **Add file → Upload files** en sleep alles uit deze zip erin (de mappen `site`, `netlify`, `supabase` en de bestanden `netlify.toml` en `LEESMIJ.md`). Klik op **Commit changes**. In deze zip zit géén `config.js`, dus jouw ingevulde Supabase-gegevens blijven gewoon staan.
2. **Database bijwerken**: open in Supabase de **SQL Editor**, plak de inhoud van `supabase/update-to-english.sql` en klik op **Run**. Daarmee worden de meldingen in de formulieren Engels, en worden de voorbeeldteksten Engels. Teksten die Lamin zelf al had aangepast, blijven zoals ze zijn.

## Update: links bij nieuwsberichten

Na het uploaden van deze versie één keer in Supabase → **SQL Editor** de inhoud van `supabase/update-news-links.sql` plakken en op **Run** klikken. Daarmee:
- kunnen nieuwsberichten een link krijgen naar een aflevering en/of naar een andere pagina (Facebook, Instagram, YouTube…);
- zijn nieuwe nieuwsberichten standaard meteen **Live**;
- worden nieuwsberichten die per ongeluk als concept (draft) waren blijven staan, alsnog live gezet.

## Update: transcript en highlights (Riverside)

**Eerst** in Supabase → **SQL Editor** de inhoud van `supabase/update-transcripts.sql` plakken en op **Run** klikken, **daarna** de bestanden in GitHub uploaden en committen.
Bij elke aflevering kan Lamin dan het transcript uit Riverside plakken (wordt doorzoekbaar en uitklapbaar op de site, tijden worden klikbaar) en links naar korte clips (YouTube Shorts krijgen een speler).

## Update: delen op Facebook, socials en WhatsApp-knop

Geen SQL nodig: alleen de bestanden uploaden in GitHub en op **Commit changes** klikken.
- Onder elke aflevering, gast, nieuwsbericht en verhaal staan knoppen **Facebook**, **WhatsApp** en **Copy link**. In de gouden balk (als Lamin is ingelogd) staat een blauwe knop **📣 Share on Facebook**: die opent Facebook én kopieert een kant-en-klare tekst om te plakken.
- Facebook-knop: op de **telefoon** opent het deelmenu van de telefoon (kies de Facebook-app), op de **computer** een klein Facebook-venster boven de site.
- Delen staat bovenaan elke aflevering, gast en nieuwsbericht; op de lijsten heeft elke kaart een blauwe **Share**-knop. Bezoekers hebben ook **Share with friends** (telefoon: deelmenu met WhatsApp, Messenger, sms…; computer: link kopiëren) en op de homepage een blok "Enjoying Joe Point?".
- **Settings → Social media**: Facebook, Instagram, YouTube en TikTok invullen. Alleen ingevulde links verschijnen (bovenin als icoon, onderaan en op de contactpagina).
- **Settings → Website credit**: naam en WhatsApp-nummer van de websitebouwer. Onderaan de site verschijnt dan "Website by … · Want a website like this?" met een WhatsApp-knop. Leeg laten = niets tonen.

## Wat Lamin zelf kan (via /admin)

- **Afleveringen**: titel, samenvatting, show notes, link naar Spotify/YouTube/Apple/SoundCloud (de speler verschijnt vanzelf), cover, gasten en categorie. Afleveringen kunnen ook ingepland worden.
- **Gasten**: foto, bio en socials. De gastpagina toont automatisch alle afleveringen waarin de gast zit.
- **Nieuws & updates**: nieuws, updates, gastaankondigingen en fotoreeksen.
- **Community stories**: ingestuurde verhalen goedkeuren, afwijzen of corrigeren. Een ingestuurde foto blijft privé tot het verhaal is goedgekeurd.
- **Inbox**: antwoorden op de vraag van de week, voice messages (luisteren en downloaden), onderwerp-suggesties en contactberichten. Antwoorden en voice messages kan hij met één klik op de site zetten.
- **Instellingen**: alle teksten, foto's, socials, de vraag van de week en de **huisstijl** (logo, donker/licht, kleuren, lettertype en vijf kant-en-klare stijlen).

## Gratis blijven: goed om te weten

- **Opslag**: in het gratis plan heb je ongeveer 1 GB voor foto's en audio. Foto's worden automatisch verkleind. Zet afleveringen het liefst als **link** (Spotify/YouTube): dat kost niets aan opslag.
- **Database pauzeert niet**: de functie `keepalive` doet elke dag een klein verzoekje. Je kunt dat controleren in Netlify onder **Logs → Functions → keepalive**.
- **Back-up**: het gratis plan heeft geen automatische back-ups om te downloaden. Exporteer af en toe de tabellen via **Table Editor → Export to CSV**, of kies later een betaald plan.
- **Groeien**: als het gratis plan te klein wordt, ga je in Supabase en/of Netlify naar een betaald plan. Er verandert niets aan de site.

## Beveiliging (kort)

- Bezoekers kunnen alleen lezen wat gepubliceerd is.
- Inzenden gaat via beveiligde databasefuncties, met een spamfilter en een maximum aantal inzendingen per IP-adres.
- E-mailadressen van inzenders staan in een aparte tabel die alleen de beheerder kan lezen.
- Ingezonden foto's en voice messages staan in een privémap, totdat Lamin ze openbaar maakt.
