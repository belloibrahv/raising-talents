# ADR-043: Link previews

- Status: Accepted
- Date: 2026-10-06

## Context

Shared talent pages (ADR-042) spread over WhatsApp, Instagram, X and LinkedIn. Those apps build
a preview from the page's meta tags, and they do not run JavaScript. The app is rendered in the
browser, so every link previewed as plain "Raising Talents" with no picture.

## Decision

- **Every page** carries Open Graph and Twitter tags in `index.html`: the site name, the
  headline, and a branded 1200×630 image (`/og.png`). The web server makes the image address
  absolute from `PUBLIC_ORIGIN`, because previews need full URLs.
- **A shared talent page** (`/t/{handle}/{code}`) gets its own tags, written by the web server
  (`scripts/share-tags.mjs`).
  - The server asks the API for the shared profile over the private network, the same call
    the page makes, passing the visitor's address so the API's rate limit still applies.
  - It writes the title ("Ngozi Adeyemi · Singer in Lagos"), the start of the story as the
    description, the profile photo as the image, and the page's own URL.
  - Everything from the API is escaped, so a name cannot add markup.
  - A portrait photo uses the small `summary` card rather than the wide one.
- **Caching:** answers are cached for 5 minutes (500 entries), so a link posted in a busy group
  costs one API call. A profile that is not shareable is cached as "none" for the same time.
- **Failure:** if the API does not answer within 3 seconds, or answers anything but 200, the
  plain page is served. Previews are a nicety and must never block the page.

## Consequences

- A talent who turns their link off can still preview for up to 5 minutes, from the cache. The
  page itself checks on every load and shows "not available".
- This runs in our web server, which hosts the app on Railway (ADR-036). The CloudFront
  hosting in the Terraform does not have it yet: there it needs a Lambda@Edge function, or the
  same server behind CloudFront. Until then the default preview applies there.
