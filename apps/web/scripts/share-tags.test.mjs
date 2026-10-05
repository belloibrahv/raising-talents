import { describe, expect, it } from 'vitest';
import { createShareCache, SHARED_PATH, withShareTags } from './share-tags.mjs';

const html = `<html><head>
    <title>Raising Talents</title>
    <meta property="og:title" content="Raising Talents" />
    <meta
      property="og:description"
      content="Default"
    />
    <meta property="og:image" content="/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
  </head><body></body></html>`;

const profile = {
  displayName: 'Ngozi "Nz" Adeyemi',
  discipline: 'Singer',
  city: 'Lagos',
  bio: 'Afro-soul singer from Lekki. <script>alert(1)</script>',
  avatarUrls: {
    small: '/media/a/256.webp',
    medium: '/media/a/1024.webp',
    large: '/media/a/2048.webp',
  },
};

describe('link previews for shared pages (ADR-043)', () => {
  it('matches shared links by their code only', () => {
    expect('/t/ngozi.sings/Ab3dE6fG'.match(SHARED_PATH)?.[1]).toBe('Ab3dE6fG');
    expect(SHARED_PATH.test('/t/ngozi.sings')).toBe(false);
    expect(SHARED_PATH.test('/t/ngozi.sings/short')).toBe(false);
  });

  it("writes the talent's title, story and photo, escaped, in place of the defaults", () => {
    const page = withShareTags(html, profile, {
      url: 'https://raisingtalents.app/t/ngozi.sings/Ab3dE6fG',
      origin: 'https://raisingtalents.app',
    });
    expect(page).toContain(
      '<title>Ngozi &quot;Nz&quot; Adeyemi · Singer in Lagos | Raising Talents</title>',
    );
    expect(page).toContain(
      '<meta property="og:image" content="https://raisingtalents.app/media/a/2048.webp" />',
    );
    expect(page).toContain(
      '<meta property="og:url" content="https://raisingtalents.app/t/ngozi.sings/Ab3dE6fG" />',
    );
    expect(page).toContain('&lt;script&gt;');
    expect(page).not.toContain('<script>alert');
    expect(page).not.toContain('og:image:width');
    expect(page).toContain('<meta name="twitter:card" content="summary" />');
    expect(page.match(/property="og:description"/g)).toHaveLength(1);
  });

  it('keeps the branded card when the talent has no photo', () => {
    const page = withShareTags(
      html,
      { ...profile, avatarUrls: null },
      {
        url: 'https://raisingtalents.app/t/x/Ab3dE6fG',
        origin: 'https://raisingtalents.app',
      },
    );
    expect(page).toContain('content="https://raisingtalents.app/og.png"');
    expect(page).toContain('summary_large_image');
  });

  it('forgets answers after a while', () => {
    let clock = 0;
    const cache = createShareCache({ ttlMs: 1000, now: () => clock });
    cache.set('Ab3dE6fG', 'page');
    expect(cache.get('Ab3dE6fG')).toBe('page');
    clock = 2000;
    expect(cache.get('Ab3dE6fG')).toBeUndefined();
  });
});
