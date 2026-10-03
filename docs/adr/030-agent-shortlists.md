# ADR-030: Agent shortlists

Status: Proposed. The limit of 500 saved talent and the private-only design wait for client sign-off; the flow is built.

## Context

Agents find talent through search (ADR-025) and then need somewhere to keep the people they are considering, with their own notes, before contact requests open (ADR-011). Without it they copy names into other apps, which loses context and spreads personal data outside the platform.

## Decision

Each agent has one shortlist:

- An agent with an active account saves a talent from their profile, with an optional private note of up to 500 characters. Saving again replaces the note and keeps the date first saved. Removing works whenever, including for talent who are hidden at the moment.
- The list shows each talent as they are now, newest saved first, 24 at a time. Talent who are suspended, banned or hiding while they delete their account drop out of the view but stay saved, so they return if reinstated. An erased account takes its rows with it.
- The shortlist holds 500 talent. Changing a note on a full list still works. The limit is checked before each new save, so two saves at the same moment can pass it by one; that is accepted.
- Talent are never told they were saved, and nobody but the agent sees the list or the notes. The list is part of the agent's data export (ADR-027).

## Alternatives considered

Several named lists per agent: useful for agencies running more than one search at a time, but more to build and explain; a single list can grow into named lists later without a migration of meaning. Telling talent they were saved: encouraging, but it reveals an agent's interest before any contact and invites pressure; it can come with contact requests if the client wants it.

## Consequences

The list reads each talent's current card on every page, so changes to a profile show at once. Contact requests (milestone 4) can start from the shortlist.
