# ADR-005: Drizzle ORM with SQL migrations

Status: Accepted

## Context

We want typed queries that stay close to SQL and migrations that reviewers can read.

## Decision

Drizzle ORM. drizzle-kit generates plain SQL migration files that are committed and reviewed in pull requests.

## Alternatives considered

Prisma; TypeORM.

## Consequences

Queries read like SQL. Every schema change is a reviewed SQL file. Migrations follow expand and contract.
