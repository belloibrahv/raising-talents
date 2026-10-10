# ADR-046: Worldwide places, a wider taxonomy and search that follows the profile

- Status: Accepted
- Date: 2026-10-10

## Context

The product started in Nigeria (ADR-013): 15 Nigerian cities, sign-up that recorded every
account as Nigerian, and a date of birth typed day first. The client wants anyone in the world
to join: "when you sign up, let's say you're in London, it should say UK or England, then you
pick the city under it."

The client also asked for:

- search built the way a profile is filled in: athletes first, then the kind of athlete;
  country, then city;
- many more kinds of talent: about 20 sports, 10 to 15 kinds of musician, and "Other" for the
  rest.

## Decision

**Places.** A `taxonomy.countries` table and a much longer `taxonomy.cities`, both loaded from
GeoNames by `apps/api/scripts/world-places.ts`: 244 countries and about 7,200 cities.

- A city is kept when it has 100,000 people or more, is a capital, is a regional capital of
  50,000 or more, or is one of its country's ten largest. Every country has somewhere to pick.
- Cities gain a `region` (state, province or nation) and a `population`. The region tells
  namesakes apart; the population puts the largest first.
- Countries carry the other names people type: "UK" and "England" find the United Kingdom.
- The 15 original city slugs keep their rows, so existing profiles are untouched.
- `GET /v1/taxonomy` returns countries and no longer returns cities.
  `GET /v1/taxonomy/countries/{code}/cities` returns one country's cities.
- Talent in a town that is not listed pick the nearest city. A profile was never meant to be
  more precise than that.

**Sign-up.** The account's country comes from the device's region, falling back to Nigeria. It
is a starting point for the pickers, not a rule; nothing is decided from it. The date of birth
is asked as day, month by name, and year, which reads the same in every country.

**Taxonomy.** Migration 0026 adds sports up to 20, musicians up to 15, more of every other
category, two categories (Dance; Art and design) and "Other" in each. Music styles (Afrobeats,
gospel, hip-hop and so on) are skills, so a singer is also found by style.

**Search.** `country` is a new filter, and the response counts results per type and per
country as well as per category and city. The screen asks in the order of a profile:
category, then type; country, then city. Age and gender sit behind "More filters".

Search stops at the type (football, not goalkeeper). Positions would make the lists long and
most searches empty while there are few talent; skills such as "Goalkeeping" cover it in the
text search for now.

## Consequences

- GeoNames data is CC BY 4.0. The credit is in the README. To refresh the list, download the
  three files named in the script and write a new migration from its output.
- After deploying, run `pnpm --filter @rt/api search:rebuild`: names stored in the index
  ("Football") change to the new ones ("Football (soccer)").
- The catalog holds about 7,200 cities in memory in each process. That is a few megabytes.
- The mobile app is parked (ADR-023) and does not read cities; when it returns it uses the
  same two endpoints.
- Still open: positions within a sport, and letting the client's team edit the lists without
  a migration.
