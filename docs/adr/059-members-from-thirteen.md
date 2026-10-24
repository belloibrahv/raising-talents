# ADR-059: Members from thirteen

- Status: Accepted
- Date: 2026-10-24
- Supersedes: ADR-012 (adults only)

## Context

ADR-012 accepted only people aged 18 and over, to keep the launch safe while guardian
accounts were not designed. The client asked for younger talent to be able to join
(issue #68): athletes, singers and dancers are often scouted in their early teens.

## Decision

- **Thirteen and over can join.** Sign-up refuses anyone under 13 with
  `UNDER_MINIMUM_AGE`, and their date of birth is not stored, as before. The number is
  `MINIMUM_AGE_YEARS` in the contracts, so the API, the app and the messages share it.
- **Search reaches the same ages.** Agents can filter talent from 13 (`SEARCH_MIN_AGE`).
- **Reports and bans follow the new line.** "May be under 13" replaces "May be under 18"
  for moderators, and a ban is for anyone who seems under 13.
- **Messages between talent keep to one age band** (ADR-061): under-18s write only to
  under-18s, adults only to adults. Verified agents can still ask to contact any talent, and
  the talent must accept first (ADR-011).

## Alternatives considered

- **Guardian accounts first:** the safest way to serve minors, but a new design (consent,
  linking, what a guardian sees) that would hold the change back for weeks.
- **Sixteen:** fewer minors to protect, but the client wants to reach younger talent.

## Consequences

- Members aged 13 to 17 are minors. The age is the one they type, so it is not proof.
- Data protection law in some countries, Nigeria's among them, treats under-18s as children
  whose data needs a parent's consent. That needs a check with counsel before the app is
  promoted to young people, and guardian consent may follow as its own decision.
- Moderators should treat reports about minors first.
