# ADR-002: PostgreSQL as system of record

Status: Accepted

## Context

The PRD suggested Firestore. Our data is mostly relational: requests, conversations, bookmarks, reports and audit trails with strong consistency needs.

## Decision

PostgreSQL (Amazon RDS) holds all business data. Each module owns its own schema (accounts, identity, platform and so on).

## Alternatives considered

Firestore; MongoDB.

## Consequences

Transactions, constraints and joins are available. Full-text search is handled by Typesense (ADR-006), not by the database.
