# ADR-012: Adults only (18+) in v1

Status: Proposed

## Context

Many talents (athletes, models, musicians) start young. Serving minors needs guardian consent flows and stricter moderation.

## Decision

v1 accepts only people aged 18 and over. Under-18 sign-ups are refused and their date of birth is not stored.

## Alternatives considered

Guardian accounts in v1; no age gate.

## Consequences

Safest launch. Guardian accounts get their own design if the client needs younger talent. Enforced today in Account.register and covered by tests.
