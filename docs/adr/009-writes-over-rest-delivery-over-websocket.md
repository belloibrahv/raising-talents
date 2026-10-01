# ADR-009: Writes over REST, delivery over WebSocket

Status: Accepted

## Context

Chat needs reliable sends and instant delivery on mobile networks that drop often.

## Decision

Messages are sent with idempotent REST calls. The socket only pushes new events to connected clients.

## Alternatives considered

Sending messages through the socket.

## Consequences

Retries are safe and every write goes through the same validation, rate limits and moderation as the rest of the API.
