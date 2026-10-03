# ADR-039: Reporting from a conversation

- Status: Accepted
- Date: 2026-10-04

## Context

Fake agents are the main abuse on talent platforms (ADR-011, ADR-028). Reports could only
name a talent's public profile. Agents have no public page, so a talent who was asked for
money in a chat (ADR-038) had no way to report the agent. Moderators also had nothing to go
on except the reporter's note.

## Decision

- **Reporting from a conversation.** A report's subject can be `{ kind: 'conversation',
conversationId }`. The reported person is the other person in that conversation. Only the
  two people in the conversation can file it; anyone else gets the same 404 as a missing
  conversation. Either side can report: a talent reports an agent, and an agent can report a
  talent.
- **Evidence.**
  - The report keeps the reported person's latest 10 messages in that conversation, oldest
    first, in a `jsonb` column on the report.
  - The reporter's own messages are never kept. Moderators read only what the reported
    person wrote, which is all they need to judge it.
- **What moderators see.** The queue shows the agency (name and whether it is verified) for
  agents, and the evidence from the newest conversation report.
- The existing rules still apply: the reporter needs a verified email, there are 10 reports a
  day, and there is one open report per reporter and account. Reporters stay anonymous.

## Consequences

- The evidence is a snapshot from the moment of the report. Later edits are impossible, and
  messages deleted with an account stay in the open report until a moderator closes it. That
  keeps the evidence, which is the point.
- Reporting does not close the conversation. A talent can still decline a request, and a
  "block" control is a separate follow-up.
