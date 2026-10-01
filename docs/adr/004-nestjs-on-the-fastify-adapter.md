# ADR-004: NestJS on the Fastify adapter

Status: Accepted

## Context

We need modules, dependency injection and guards that support clean architecture, with good throughput.

## Decision

NestJS 12 (ESM) running on Fastify 5. Use cases are plain classes built by factory providers, so the domain and application layers do not depend on NestJS.

## Alternatives considered

Plain Fastify; Express.

## Consequences

Framework code stays at the edges. Swapping the HTTP layer would not touch business rules.
