# ADR-008: Transactional outbox for domain events

Status: Accepted

## Context

Publishing to a queue after a commit can lose events (crash between commit and publish) or create phantom events (publish then rollback).

## Decision

Events are written to platform.outbox in the same transaction as the change. The worker publishes them with SKIP LOCKED and exponential backoff, up to 10 attempts, then alerts.

## Alternatives considered

Publishing straight to a queue after commit.

## Consequences

No lost or phantom events. Handlers must be idempotent because delivery is at least once.
