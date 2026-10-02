# ADR-025: Talent search: who appears, who can search, and where Typesense runs

Status: Proposed. The search rules are built; hosting waits for a decision (see Options).

## Context

ADR-006 chose Typesense, fed from domain events, with Postgres as the source of truth. Search is how agents find talent, so it decides who is visible and what a search can reveal.

## Decision

Who appears: a talent with a complete profile and an active account. Every `talent.TalentProfileUpdated` and `accounts.OnboardingCompleted` event makes the worker read the current state and add, update or remove that talent, so repeated or late events cannot leave someone visible who should not be. `pnpm --filter @rt/api search:rebuild` recreates the index from Postgres into a new collection and swaps the `talents` alias, so searches keep working during a rebuild.

Who can search: agents, moderators and admins with an active account (an agent who has finished their profile). Talent find each other through shared links. 120 searches a minute per person.

What a search reveals: the same facts as the public profile, with age in years. The date of birth is stored in the index as a day number, only so agents can filter by age; it is never returned. Gender can be filtered only for talent who chose to be found by gender, as on the profile.

Ranking: name matches first, then skills and disciplines, then city, then the bio, with typo tolerance. With no text, newest profiles first. Filter options show counts for the current search.

`SEARCH_INDEX=disabled` makes the search endpoint answer 503 `SEARCH_UNAVAILABLE` and indexing do nothing. Staging uses this until hosting is decided.

## Options for hosting (decision needed)

1. Typesense Cloud, in the region nearest the API. No servers to run; priced by memory. Small to start, and backups are managed.
2. Typesense on ECS Fargate, one task, rebuilding from Postgres when it starts. No new vendor; the index is lost on each restart until the rebuild finishes (seconds at launch size, longer as talent grows).
3. Typesense on ECS with EFS storage, kept across restarts. No rebuild wait; EFS adds latency and cost.

Recommendation: option 1 for the MVP, because search stays up through deploys and nobody operates it; move to option 3 if cost or data residency requires.

## Consequences

Agents can find talent in milliseconds with typos forgiven. Facet counts narrow with the current filters; showing every option's count regardless of the selected one needs a second query and can come later. Whatever hosting is chosen, the API needs `SEARCH_INDEX=typesense`, `TYPESENSE_URL` and `TYPESENSE_API_KEY`, and the first deploy runs `search:rebuild`.
