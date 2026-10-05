// Link previews for shared talent pages (ADR-043). Chat apps and social networks read the
// page's meta tags without running JavaScript, so the web server writes them.

/** /t/{handle}/{code}: the code is eight URL-safe characters (ADR-042). */
export const SHARED_PATH = /^\/t\/[^/]+\/([A-Za-z0-9_-]{8})\/?$/;

const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** The first sentence or so of the story, cut at a word near 160 characters. */
function summary(text) {
  const flat = String(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 157);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Turns a relative media address into an absolute one: previews need full URLs. */
const absolute = (url, origin) => (url.startsWith('http') ? url : new URL(url, origin).href);

/**
 * The page with this talent's title, description and photo in place of the defaults.
 * Everything from the API is escaped, so a name cannot add markup to the page.
 */
export function withShareTags(html, profile, { url, origin }) {
  const title = `${profile.displayName} · ${profile.discipline} in ${profile.city} | Raising Talents`;
  const description = summary(profile.bio) || `${profile.discipline} in ${profile.city}.`;
  const image = profile.avatarUrls
    ? absolute(profile.avatarUrls.large, origin)
    : `${origin}/og.png`;
  const tags = [
    ['og:title', title],
    ['og:description', description],
    ['og:url', url],
    ['og:type', 'profile'],
    ['og:image', image],
  ];
  let page = html.replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`);
  for (const [property, content] of tags) {
    const tag = `<meta property="${property}" content="${escape(content)}" />`;
    const existing = new RegExp(`<meta\\s+property="${property}"[^>]*>`, 's');
    page = existing.test(page)
      ? page.replace(existing, tag)
      : page.replace('</head>', `    ${tag}\n  </head>`);
  }
  // A portrait photo is not 1200 by 630: drop the default size hints and use the small card.
  if (profile.avatarUrls) {
    page = page
      .replace(/\s*<meta property="og:image:width"[^>]*>/, '')
      .replace(/\s*<meta property="og:image:height"[^>]*>/, '')
      .replace(/<meta name="twitter:card"[^>]*>/, '<meta name="twitter:card" content="summary" />');
  }
  return page;
}

/** Remembers answers briefly, so a link posted in a busy group chat costs one API call. */
export function createShareCache({ ttlMs = 5 * 60_000, max = 500, now = () => Date.now() } = {}) {
  const entries = new Map();
  return {
    get(code) {
      const entry = entries.get(code);
      if (!entry || entry.expires < now()) return undefined;
      return entry.value;
    },
    set(code, value) {
      if (entries.size >= max) entries.delete(entries.keys().next().value);
      entries.set(code, { value, expires: now() + ttlMs });
    },
  };
}
