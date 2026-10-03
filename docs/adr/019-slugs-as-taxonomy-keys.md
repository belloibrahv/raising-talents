# ADR-019: Slugs as taxonomy keys, seeded by migration

Status: Accepted.

## Context

Section 7 of the design puts categories, subcategories, skills and cities in taxonomy tables with a unique slug. Profiles, search filters and the app all refer to these entries, and the same list must exist identically in local, staging and production databases.

## Decision

The slug is the primary key (`football`, `ng-lagos`). Lists are created and changed only by SQL migrations. An entry is retired by setting `active = false`, never deleted, and a slug is never reused for a different meaning.

The launch list in migration 0004 is provisional, built from the PRD's five talent types, until the client answers open question 8.

## Alternatives considered

UUID keys with a separate slug column. Lists managed through the admin app.

## Consequences

Seeds are deterministic across environments, payloads and logs are readable, and renaming a label never touches profiles. Correcting the provisional list is a new migration, not a code change. An admin-managed list can come later if the client needs to edit categories without a release.
