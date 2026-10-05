# ADR-041: Live updates over server-sent events

- Status: Accepted
- Date: 2026-10-05

## Context

ADR-009 sends writes over REST and pushes delivery over a socket. ADR-038 started with polling:
5 seconds for an open chat and 45 seconds for the Messages badge. Polling makes chat feel slow
and spends requests on screens where nothing changed.

## Decision

**One stream per tab.** `GET /v1/me/events` is a server-sent-events stream for the signed-in
person.

- **Events are nudges only:** `{ type: 'conversation', conversationId }` or
  `{ type: 'notifications' }`, and never any content. The client refetches through the usual
  endpoints, so every read still passes the same checks, and a missed event costs only a short
  delay.
- **Why not WebSockets:** SSE is one-way, works over plain HTTP through the web server's proxy
  (ADR-036), reconnects simply, and needs nothing in the API beyond a long response. The web
  app reads it with `fetch`, because `EventSource` cannot send the bearer token.
- **Heartbeat:** a comment every 15 seconds keeps the stream inside the proxy's 30-second idle
  limit.

**Fan-out through Redis pub/sub.**

- Each person has a channel, `rt:user:{id}`. Every API instance subscribes, on one connection,
  only to the people connected to it.
- After a messaging write commits, the controller publishes to both people in the
  conversation, so other tabs of the writer refresh too.
- The worker publishes `notifications` after it adds an inbox notice.
- Publishing is best effort: a failure is logged and never fails the write.

**Polling stays as a safety net.**

| Query          | Stream up | Stream down |
| -------------- | --------- | ----------- |
| Open thread    | 60 s      | 5 s         |
| Messages list  | 120 s     | 20 s        |
| Messages badge | 180 s     | 45 s        |
| Notifications  | 300 s     | 60 s        |

**Reconnecting.** On connect and after a reconnect, the client refetches messages and
notifications to catch up. Reconnects back off from 2 to 60 seconds.

## Consequences

- No new infrastructure: Redis already backs rate limits. Each open tab holds one HTTP
  connection to an API instance, which is fine at launch scale. A dedicated gateway can take
  over later without changing the events.
- Our API calls do not support cancellation yet, so an event that arrives while a refetch is
  already in flight is folded into that request. The next event, or the slow poll, catches up.
