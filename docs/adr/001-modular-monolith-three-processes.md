# ADR-001: Modular monolith, three processes

Status: Accepted

## Context

A small team is building a two-sided marketplace with messaging, media and moderation. Microservices would multiply deploys, networking and on-call work before there is traffic to justify it.

## Decision

One NestJS codebase split into business modules with strict boundaries. It runs as three processes from the same image: api (HTTP), realtime (WebSocket) and worker (queues and outbox).

## Alternatives considered

Microservices; serverless functions.

## Consequences

One deploy and one transaction boundary. Modules talk only through facades and events, so any module can be extracted later without rewriting callers.
