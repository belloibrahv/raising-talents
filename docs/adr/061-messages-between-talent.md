# ADR-061: Messages between talent

- Status: Accepted. The daily limit is provisional, like ADR-038's.
- Date: 2026-10-24
- Changes: ADR-011 and ADR-038 (who can start a conversation)

## Context

Talent post about work they want to do together ("who wants to be in my music video?"),
but only agents could start a conversation, so a talent who read the post had no way to
answer it (issue #71).

## Decision

- **The same request, between two talent.** A talent writes a first message (20 to 1,000
  characters) from the other talent's profile, through the address agents use,
  `POST /v1/talents/{handle}/contact`. The other talent accepts or declines, and chat opens
  only if they accept. States, the 30-day wait after a decline, withdrawing, blocking,
  reports from the conversation and the data export work as they do for agents.
- **One conversation per pair.** It is a conversation of kind `peer`. The two talent sit in
  the agent and talent columns in a fixed order (the lower id first), so the existing
  one-per-pair index holds whoever asks first. Rules work on those two places, never on the
  column names.
- **Who can write.** A talent with a verified email whose profile others can see, to a
  talent others can see, never to themselves. Ten new conversations a day.
- **Same age group only.** Under-18s write only to under-18s, and adults only to adults
  (ADR-059). Across the line the API answers `FORBIDDEN`, and the profile page offers no
  way to write. Verified agents can still ask to contact any talent, as before.
- **Chat stays open** while both talent are visible to others, as it does while a talent
  is visible to an agent.
- **Notifications.** The talent asked gets an inbox notice and an email without the text
  (ADR-038). The one who asked gets a notice of the answer, and an email only when it is
  accepted. The conversation summary carries its `kind`, so the app words requests from
  talent differently from an agency's.

## Alternatives considered

- **Open messages without accepting first:** quicker, but anyone could fill a stranger's
  inbox, and minors would receive messages they did not agree to.
- **A separate table for talent conversations:** a second copy of every rule (states,
  reads, blocking, reports, export) to keep in step.
- **Renaming the agent and talent columns:** clearer names, but a migration across every
  query for no change in behaviour. The `kind` column and `peerPlaces` say what the
  columns mean.

## Consequences

- Talent now reach each other, so moderators will see reports from talent about talent.
- Talent near their 18th birthday move to the adult group on the day. Conversations that
  are already open stay open.
- The age is the one the member typed (ADR-059), so the split is only as good as that.
