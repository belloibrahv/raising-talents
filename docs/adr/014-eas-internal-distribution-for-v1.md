# ADR-014: EAS internal distribution for v1

Status: Accepted

## Context

The client wants installable builds before any store release.

## Decision

Ship through EAS internal distribution with development, preview and production profiles. Store release comes later.

## Alternatives considered

Expo Go; public store release.

## Consequences

Expo Go cannot run our native modules. Store review is deferred until the product is ready.
