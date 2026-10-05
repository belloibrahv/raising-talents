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
- **The page.** `/t/{handle}` in the web app, backed by `GET /v1/shared/talents/{handle}`,
  which needs no sign-in. It shows:
  - the name, photo, discipline, city, story, skills, verified badge and ready portfolio items;
  - never the age, gender, date of birth, email or phone number. Agents see age in years
    inside the app; a stranger does not.
- **Who gets a page.** Only a complete profile, on an active account with a verified email
  (`isPublic`), with the link turned on. Every other case answers the same 404, so a visitor
  cannot tell an old link from a suspended account.
- **Rate limit.** 60 pages a minute per IP, which allows real visitors but stops someone
  walking every handle.
- **Calls to action.** The page ends with an invitation to both kinds of visitor: agents to
  join and contact the talent, and talent to build a profile of their own.

## Consequences

- Handles become public URLs, so a handle change breaks old links. That is acceptable, and the
  page explains when a profile is not available.
- The page is rendered in the browser, so link previews (Open Graph) show the app's default
  title. Server-rendered previews are a follow-up.
