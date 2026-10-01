# ADR-016: Pin TypeScript 5.9 for now

Status: Accepted

## Context

TypeScript 7 (the native port) is the newest release. NestJS relies on decorator metadata, which is proven on the 5.x compiler.

## Decision

Pin TypeScript 5.9.3 across the monorepo. Revisit when NestJS documents support for TypeScript 7.

## Alternatives considered

Adopting TypeScript 7 immediately.

## Consequences

Slower type checking than TS 7, no risk to dependency injection. Our providers already use explicit tokens, which makes the later move simpler.
