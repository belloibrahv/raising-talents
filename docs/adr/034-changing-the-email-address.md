# ADR-034: Changing the email address

Status: Accepted.

## Context

The email address is how people sign in and how we reach them, and taking it over is the usual first step in taking over an account. People still need to move to a new address when they change jobs or lose access to an old one.

## Decision

- Asking for a change needs the current password and an address no other account uses, different from the current one. Five requests an hour per account.
- A six-digit code goes to the new address; nothing changes until it is entered there (ten minutes, five tries, the same rules as other codes). The old address is told at once that a change was asked for, and again once it is done. Both messages show the new address partly hidden ("m••••••@example.com").
- The new address counts as verified, since the code proved the person reads it. Signing in uses it from then on. Sessions are kept.
- The pending change lives in `identity.email_changes`, one per account, and a new request replaces the last. Events carry no addresses: the worker reads them from that row, sends the code and the warnings, and removes the row once the old address has been told. A request not finished within a day is ignored.
- The account page shows the address with a Change button, then the code step, which comes back after a reload and offers "Keep my current address". When nothing is waiting, the check answers 204 so the page logs no error.
- The inbox (ADR-032) records `email_changed`.

This change also makes the "password changed" email say which devices were signed out: every device after a reset, the other devices after a change in the app (ADR-031).

## Alternatives considered

Changing at once and emailing the old address an undo link: quicker, but an attacker who knows the password then controls the account until the owner reads their email. Asking the old address to approve too: safer against a stolen password, but it locks out people who lost the old inbox, which is the common reason to change.

## Consequences

Support should expect people who lost both their password and their old inbox; recovering those needs a manual check, outside this flow.
