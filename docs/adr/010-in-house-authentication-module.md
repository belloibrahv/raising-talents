# ADR-010: In-house authentication module

Status: Accepted

## Context

We need full control of sessions, roles, age gating, account status and data residency.

## Decision

Own identity module: Argon2id passwords, 15-minute EdDSA access tokens with only user and session ids, rotating refresh tokens with family reuse detection, and emailed one-time codes.

## Alternatives considered

Firebase Auth; Auth0 or Clerk; Supabase Auth.

## Consequences

No vendor lock-in or per-user fees. We carry the security responsibility, which is why identity has the strictest test coverage.
