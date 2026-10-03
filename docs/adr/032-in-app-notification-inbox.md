# ADR-032: An in-app notification inbox

Status: Accepted.

## Context

Decisions made on someone's behalf (a held photo approved or rejected, an agency verified or declined, a deletion scheduled, an account reinstated) were only emailed. People who miss or filter the email had no record in the app, and contact requests and chat (milestone 4) will need somewhere to announce themselves.

## Decision

- The notifications module keeps an inbox beside its email log. Each notice stores its kind and that kind's details (a rejection reason, a date) and never the wording: the app words each kind, so copy can change and be translated without touching stored notices.
- Notices are keyed by the event that caused them, like the email log, so a redelivered event adds nothing. The inbox is written before the email; each part is idempotent, so a retried event completes whichever part failed.
- Kinds today: media approved or rejected after review, agency verified or declined, deletion scheduled, account reinstated, and password changed (inbox only; identity already emails it). Suspension and ban stay email only, because the person cannot sign in to read them.
- The header shows a bell with the unread count, checked every minute and when the app returns to the front. Opening the inbox marks everything read.
- Notices are kept for 180 days, read or not; a daily worker job removes older ones. They are part of the data export (ADR-027) and go when the account is erased.

## Alternatives considered

Web push notifications: valuable for a PWA, but they need permission prompts, a push service and per-browser subscriptions; the inbox comes first and push can deliver the same notices later. Storing rendered text: simpler to show, but it freezes the wording and the language at the moment of writing.

## Consequences

Every new event worth telling someone about needs a kind in the contract and words in the app, which the type system enforces. The badge can lag by up to a minute.
