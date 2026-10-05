# ADR-042: Shareable talent pages

- Status: Accepted
- Date: 2026-10-06

## Context

Talent promote themselves on Instagram, WhatsApp and their CVs. Their profile could only be
seen by signed-in agents, so a link sent to a friend, a parent or an outside casting director
led to a sign-in wall. A page people can share is also the cheapest way for the product to
grow.

## Decision

- **Off by default.** A talent turns on a public link from Home (`publicLink` on their
  profile) and can turn it off at any time. Turning it on is an explicit choice, because the
  page is then visible to anyone on the internet.
- **The link.** `/t/{handle}/{code}` in the web app, backed by `GET /v1/shared/{code}`,
  which needs no sign-in.
  - The code is eight random URL-safe characters (48 bits), made the first time the link is
    turned on. It stays with the talent for good, through handle changes and turning the
    link off and on.
  - Lookups go by code alone; the handle is only there for people reading the link. So an
    old link can never show whoever takes a handle someone gave up.
- **The page shows:**
  - the name, photo, discipline, city, story, skills, verified badge and ready portfolio items;
  - never the age, gender, date of birth, email or phone number. Agents see age in years
    inside the app; a stranger does not.
- **Who gets a page.** Only a complete profile, on an active account with a verified email
  (`isPublic`), with the link turned on. Every other case answers the same 404, so a visitor
  cannot tell an old link from a suspended account.
- **Rate limit.** 60 pages a minute per IP, which allows real visitors but stops someone
  walking codes. Behind a load balancer (`TRUST_PROXY`), the API now trusts exactly one hop,
  so a caller cannot choose their own address with `X-Forwarded-For`. This protects every IP
  rate limit, not only this one.
- **Calls to action.** The page ends with an invitation to both kinds of visitor: agents to
  join and contact the talent, and talent to build a profile of their own.

## Consequences

- A link keeps working through a handle change; only the handle text in it goes stale.
- The page is rendered in the browser, so link previews (Open Graph) show the app's default
  title. Server-rendered previews are a follow-up.
