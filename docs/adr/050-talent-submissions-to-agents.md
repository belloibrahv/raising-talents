# ADR-050: Talent submissions to agents

- Status: Accepted. The numbers are provisional, like ADR-038's.
- Date: 2026-10-11

## Context

ADR-011 and ADR-038 let only verified agents start a conversation. ADR-049 then let agents
say they are "Open for submissions" and let talent find them, but a talent who found an open
agent could do nothing except save them. The badge made a promise the product did not keep.

## Decision

- **A submission is a contact request asked from the other side.** A talent writes a first
  message (20 to 1,000 characters) to an agent, `POST /v1/agents/{id}/submission`. It is the
  same conversation and the same states (`requested`, `accepted`, `declined`, `withdrawn`).
  The conversation records who asked (`requested_by`), and the other person answers.
- **Who can send one.** A talent with a verified email whose profile others can see: the
  agent will open it first. **To whom:** an agent talent can find (ADR-049) whose roster
  status is `open`. An agent who is full or has not said gets no submissions, and the page
  says so. Unlisted agents answer the same 404 as a missing one.
- **Limits.** Five submissions a day per talent. One conversation per pair still holds: if
  the agent has already asked, the talent is told to answer that request.
- **Answering and taking back.** Only the person asked can accept or decline; only the person
  who asked can withdraw. After a decline, the person who was turned down waits 30 days. The
  person who declined may reach out at any time: an agent who declined a submission can send
  a contact request the next day, and a talent who declined an agent can send a submission.
- **What each side sees.** As before, the person who was asked no longer sees a request they
  declined or that was withdrawn; the person who asked sees all of theirs. The Messages
  badge counts requests waiting for your answer, whichever kind.
- **Notifications.** The agent gets an inbox notice and an email for a submission, without
  its text (ADR-038). The talent gets a notice when it is answered, and an email only when
  it is accepted.
- **Blocking and reports** work unchanged: they were already written for two people.

## Alternatives considered

A separate submissions inbox with its own states: two things to keep in step, and two places
for an agent to look. Letting talent write to any verified agent: agents who are not looking
would be flooded, which is what the roster status is for. A form that emails the agency: the
conversation leaves the app, where it cannot be reported or blocked.

## Consequences

- An agent who sets "Open for submissions" will receive them, so the status is a commitment.
  The form's hint and the agent's page say what it means.
- Existing conversations are all agent-initiated, which is the column's default.
- The decline cooldown now protects agents from repeated submissions as well as talent from
  repeated requests.
