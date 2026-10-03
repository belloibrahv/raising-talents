# ADR-038: Contact requests and chat

- Status: Accepted. The numbers marked provisional await client sign-off.
- Date: 2026-10-03

## Context

ADR-011 lets only verified agents contact talent, and talent must accept before chat opens.
ADR-009 sends writes over REST, so retries are safe, and pushes delivery over a socket.
Agency verification (ADR-026), reports (ADR-028), shortlists (ADR-030) and the inbox (ADR-032)
are in place. The missing step is the contact itself.

## Decision

**One conversation per agent and talent.** A contact request is a conversation with status
`requested`, and its first message is the agent's introduction. When the talent accepts, the
same conversation becomes the chat. There is no second object to keep in step, and the
introduction stays at the top of the thread.

**Who can ask.** An agent whose account is active, whose email is verified (ADR-037) and whose
agency is verified (`AGENT_NOT_VERIFIED` otherwise). The talent must be visible to others right
now (`isPublic`). Hidden talent answer the same 404 as a missing handle.

**States.** `requested`, then `accepted` or `declined` by the talent, or `withdrawn` by the agent.

- After a withdrawal, the agent can ask again at once.
- After a decline, the agent waits 30 days (`CONTACT_DECLINED_RECENTLY`, with `Retry-After`).
- A request reopens the same conversation, so the history stays together.
- Talent no longer see requests they declined or that were withdrawn; agents see all of theirs.

**Sending.**

- Messages can be sent only while the conversation is accepted, the agent's account is active
  and the talent is visible (`CONVERSATION_CLOSED` otherwise). Reading is always allowed to
  the two people in the conversation; everyone else gets 404.
- Every write carries a `clientMessageId` made once by the client. A retry returns the stored
  message instead of posting twice; the database enforces this with a unique index, including
  when two retries arrive at once.

**Read state** is one timestamp per side. Unread counts are messages from the other person
after it. The Messages badge counts requests waiting for this talent, plus open chats with
unread messages.

**Notifications** go through the outbox and the existing Notifier:

| Event             | Who is told | Inbox | Email |
| ----------------- | ----------- | :---: | :---: |
| Contact requested | Talent      |  Yes  |  Yes  |
| Contact accepted  | Agent       |  Yes  |  Yes  |
| Contact declined  | Agent       |  Yes  |  No   |

- The request's own text is never put in an email. People read it signed in, where they can
  report it, and a phishing message gains nothing from our sender address.
- A request withdrawn before its event is delivered notifies nobody.
- Each message is not emailed. The badge covers it; a digest can come later.

**Delivery** is polling for now. The web app refreshes the open thread every few seconds and
the list less often, and only while the page is visible. The socket in ADR-009 comes later
without changing the API: it only tells clients to refetch.

**Privacy.**

- Conversations cascade when either account is erased.
- The data export lists each conversation with the person's own messages, and only a count of
  the other side's: those messages are the other person's data.

**Provisional limits.**

| What                   | Limit             |
| ---------------------- | ----------------- |
| Introduction length    | 20 to 1,000 chars |
| Message length         | 1 to 2,000 chars  |
| New requests per agent | 20 a day          |
| Messages per person    | 120 an hour       |
| Wait after a decline   | 30 days           |

## Alternatives considered

- **Separate request and conversation objects:** two lifecycles to keep in step, and the
  introduction would live apart from the chat.
- **WebSocket delivery now:** needs sticky connections through the web proxy (ADR-036) and a
  fan-out through Redis. Polling is enough at launch volume and keeps the same API.
- **Emailing every message:** noisy, and it moves conversations out of the place where they can
  be reported.

## Consequences

- An agent can only ever start one thread per talent, so spam is bounded per pair as well as
  per day.
- Text in messages is not scanned yet. Talent can report the agent from the conversation (a
  follow-up adds a `conversation` report target to ADR-028).
- Until the socket arrives, a new message can take a few seconds to appear.
