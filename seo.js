// Joe Point Podcast — SEO helpers (tags, Google texts, structured data for Google)
// Pure functions without browser dependencies: used by the website AND by the
// Netlify edge function that serves ready-made pages to Google.

/** "Gambia, #Business ,family" → ['gambia','business','family'] (lowercase, unique, max 15) */
export function normTags(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map((t) => String(t).replace(/#/g, '').replace(/[/\\?%]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 15);
}
export const tagPath = (t) => '/tag/' + encodeURIComponent(t);

/** Plain text from Markdown, shortened */
export function plain(t, n = 160) {
  const s = String(t || '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s;
}

/** One address per page for Google: no trailing slash, only ?page=N is kept */
export function canonical(origin, pathname, search = '') {
  let p = pathname.replace(/\/+$/, '') || '/';
  const page = +new URLSearchParams(search).get('page');
  return origin + p + (page > 1 ? `?page=${page}` : '');
}

/** "52 min" / "1:02:30" / "45:10" → "PT52M" (ISO 8601) or '' */
export function isoDuration(d) {
  const s = String(d || '').trim();
  let m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (m) return `PT${+m[1]}H${+m[2]}M${+m[3]}S`;
  m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return `PT${+m[1]}M${+m[2]}S`;
  const h = s.match(/(\d+)\s*(h|hr|hour|uur)/i), mi = s.match(/(\d+)\s*(m|min)/i);
  if (h || mi) return `PT${h ? +h[1] + 'H' : ''}${mi ? +mi[1] + 'M' : ''}`;
  return /^\d+$/.test(s) ? `PT${+s}M` : '';
}

const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === '' || v == null || (Array.isArray(v) && !v.length) ? undefined : v)));

/** The podcast as a whole (homepage) */
export function ldSeries({ origin, S, image }) {
  const site = S.site_title || 'Joe Point Podcast';
  return clean({
    '@context': 'https://schema.org', '@type': 'PodcastSeries',
    name: site, url: origin + '/', description: plain(S.seo_description || S.tagline || S.intro_text, 300),
    image, webFeed: origin + '/feed',
    author: { '@type': 'Person', name: S.host_name || 'Lamin', url: origin + '/about' },
    sameAs: Object.keys(S).filter((k) => k.startsWith('social_') && /^https?:\/\//.test(S[k])).map((k) => S[k]),
  });
}

export function ldEpisode({ origin, S, ep, guests = [], image, audio }) {
  const site = S.site_title || 'Joe Point Podcast';
  return clean({
    '@context': 'https://schema.org', '@type': 'PodcastEpisode',
    url: `${origin}/episode/${ep.slug}`, name: ep.title, episodeNumber: ep.number || undefined,
    datePublished: ep.published_at, description: plain(ep.seo_description || ep.excerpt || ep.shownotes, 300),
    timeRequired: isoDuration(ep.duration), image, keywords: (ep.tags || []).join(', '),
    associatedMedia: audio || ep.media_url ? { '@type': 'MediaObject', contentUrl: audio || ep.media_url } : undefined,
    partOfSeries: { '@type': 'PodcastSeries', name: site, url: origin + '/' },
    author: { '@type': 'Person', name: S.host_name || 'Lamin' },
    contributor: guests.map((g) => ({ '@type': 'Person', name: g.name, url: `${origin}/guest/${g.slug}` })),
  });
}

export function ldPerson({ origin, g, image }) {
  return clean({
    '@context': 'https://schema.org', '@type': 'Person', name: g.name, url: `${origin}/guest/${g.slug}`,
    description: plain(g.seo_description || g.tagline || g.bio, 300), image,
    sameAs: ['website', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin'].map((k) => g[k]).filter((u) => /^https?:\/\//.test(u || '')),
  });
}

export function ldArticle({ origin, S, p, image }) {
  return clean({
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, url: `${origin}/news/${p.slug}`,
    datePublished: p.published_at, description: plain(p.seo_description || p.excerpt || p.body, 300), image,
    keywords: (p.tags || []).join(', '),
    author: { '@type': 'Person', name: S.host_name || 'Lamin' },
    publisher: { '@type': 'Organization', name: S.site_title || 'Joe Point Podcast' },
  });
}

/** Breadcrumb trail (Google sometimes shows it instead of the web address) */
export function ldCrumbs(origin, items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: origin + path })),
  };
}

/** Very small Markdown → HTML (for the pages Google gets ready-made). Input is escaped first. */
export function mdLite(src) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = (s) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return String(src || '').trim().split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return '<ul>' + lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('') + '</ul>';
    const h = block.match(/^(#{1,3})\s+(.*)$/);
    if (h && lines.length === 1) return `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}
