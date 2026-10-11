# ADR-049: Agents talent can find

- Status: Accepted. Talent can now write first to agents who are open (ADR-050)
- Date: 2026-10-11

## Context

Agents could search talent, but talent could not look agents up: an agent appeared only when
they sent a contact request, with a name, a role and a city. Agents also had no photo and
nowhere to say who they are. The client asked for an agent photo and bio, for talent to
search verified agents, for agents to show whether they are taking people on, and for talent
to keep agents to come back to.

## Decision

- **An agent's page.** `GET /v1/agents/{id}`. Agents have no handle, so the page is addressed
  by the account id. It shows the agency, role, city, who they look for, the website, and
  three new things:
  - **bio**, up to 1,000 characters, for certifications, past work and what they look for;
  - **roster status**: `open` ("Open for submissions"), `full` ("Roster full"), or not said;
  - **a photo or logo**, uploaded through the same pipeline as a talent's (`avatar` purpose).
    All three are optional and none is part of what makes an agent profile complete.
- **Who is listed.** Only agents with a finished profile, a verified agency and an account in
  good standing. Everyone else answers the same 404. Renaming the agency removes the badge
  (ADR-026) and so the listing, until it is verified again. Agents always see their own page.
- **The directory.** `GET /v1/agents`, filtered by words (agency, role, bio), category,
  country, city and "open only", most recently verified first, 24 a page with a cursor. It
  is a Postgres query, not a search index: agents are few, and a partial index covers the
  listed rows. The account's status is read in the same query (the read-only join the feed
  makes, ADR-047), so a suspended agent never takes a place on a page.
- **Saved agents.** `PUT`/`DELETE /v1/agents/{id}/saved` and `GET /v1/me/saved-agents`, for
  talent only, up to 200. The agent is not told. Saved agents are in the data export; erasing
  either account removes the rows.
- **In the app.** Explore has two sides, Talent and Agents. Agent cards carry a bookmark; the
  Agents page has a Saved view. The agent's profile form gains the photo, the status and the
  bio, and links to "See your page as talent see it". Moderators can remove an agent's photo
  like any other (ADR-048).

## Alternatives considered

Indexing agents in Typesense beside talent: more moving parts for a list of tens or hundreds.
Giving agents handles: a second namespace to reserve and moderate for no gain yet. Reusing
the shortlist for both directions: its notes and its limit are an agent's working tool, and
the two lists answer different questions.

## Consequences

- "Open for submissions" tells talent an agent is looking, but talent still cannot write
  first: agents start every conversation (ADR-038). The page says so and points to the
  agent's website. Letting talent send a submission to an open agent is the natural next
  step, with its own limits.
- The directory is empty until agencies are verified, so verification must keep pace.
