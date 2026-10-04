# ADR-040: Blocking a conversation

- Status: Accepted
- Date: 2026-10-04

## Context

Declining a request (ADR-038) lets the agent ask again after 30 days, and reporting (ADR-039)
waits for a moderator. Someone being pestered needs a way to stop it themselves, now.

## Decision

- Either person in a conversation can block the other. The conversation stores who blocked and
  when, and only that person can unblock.
- **While blocked:**
  - nobody can send a message (`CONVERSATION_CLOSED`);
  - the agent cannot send a new request, even after the decline cooldown;
  - a talent cannot answer a blocked request.
- **Blocking a request** the talent has not answered also declines it. The agent hears the same
  as any decline (an in-app notice), and the talent's badge drops it.
- **Discretion:** the blocked person is not told. They see the conversation as closed, the same
  as when an account is suspended.
- **Unblocking:** the blocker still sees the conversation in their list, marked "Blocked", so
  they can unblock it. Unblocking restores the previous state, but does not reopen a declined
  request.
- **Endpoints:** `POST` and `DELETE /v1/me/conversations/{id}/block`. Both are safe to repeat.

## Consequences

- A block is per conversation, and so per agent and talent pair, because a pair only ever has
  one conversation. There is no account-wide block list to manage.
- Blocking is not a report: moderators are not involved unless the person also reports.
