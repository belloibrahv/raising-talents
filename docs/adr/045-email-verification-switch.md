# ADR-045: Email verification switch

- Status: Accepted
- Date: 2026-10-06

## Context

The live environment has no working email yet. With verification required, every new
account waited for a code that never arrived:

- the account stayed invisible to agents;
- it could not ask for agency verification;
- it could not report anyone.

ADR-037 already made verification optional for using the app, but it still gated what matters
most for testing the workflows end to end. The team asked to remove the requirement while the
product is in development and testing.

## Decision

`EMAIL_VERIFICATION` is a setting on the API and the worker: `required` (the default) or
`off`.

**With `off`:**

- Sign-up marks the account's email verified in the same transaction. No code is requested and
  no email is queued.
- On start, the worker verifies every account still waiting for a code. It goes through the
  domain, one account at a time, so `accounts.EmailVerified` reaches search and the profile
  becomes visible. This runs on every start and does nothing once no one is waiting.
- The web app needs no change: with every account verified, the "Verify your email" banner,
  the red dot and the verify prompts never show.

**Unchanged:** changing an email address still sends a code to the new address, because that
code proves the person owns it.

**`required`** stays the default, so tests, local development and a real launch keep the full
flow. Turning it back on affects only accounts created afterwards.

## Consequences

- Anyone can sign up with an address they do not own and appear verified while this is `off`.
  That is acceptable for development and testing only. The runbook says to set `required`
  before launch, once SMTP works.
- Accounts verified this way stay verified after the switch is turned back on.
