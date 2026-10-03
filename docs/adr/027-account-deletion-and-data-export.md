# ADR-027: Account deletion and data export

Status: Proposed. The 30 day grace period waits for client sign-off; the flow is built.

## Context

The Nigeria Data Protection Act gives people the right to a copy of their data and the right to have it erased. App stores also expect an account to be deletable from inside the app. Deletion is the one action a person cannot undo, and a phone left unlocked is a common way for someone else to reach it.

## Decision

Deletion is a request, then an erasure:

- The person asks from the account page with their current password and a ticked confirmation. Requests are limited to five in 15 minutes.
- The account becomes `pending_deletion` with a date `ACCOUNT_DELETION_GRACE_DAYS` ahead (30 by default, 1 to 90). From that moment the public profile, portfolio and search entry are gone, because they all require an active account.
- An email says when the erasure will happen and how to stop it. Signing in during the grace period shows a banner with "Keep my account" on every screen, which restores the account as it was.
- An hourly job (ADR-022) finds accounts past their date, removes every file the person owns from storage and Mux, then deletes the user row. Credentials, sessions, codes, profiles, portfolio, media rows and verification requests go with it by cascade. Where the person acted as a moderator, the decisions are kept with the moderator left blank.
- An `AccountDeleted` event with an empty payload tells search to drop the entry. Logs keep only the user id, which no longer points at anyone.

Suspended and banned accounts cannot request deletion themselves; staff handle those, so a ban cannot be escaped by deleting and signing up again with the evidence gone.

The export is one JSON file built from each module's own "mine" query: account facts, talent or agent profile, verification state, portfolio and media. It is sent with `cache-control: no-store` and limited to five a day.

## Alternatives considered

Immediate erasure: simpler, but one mistaken or malicious tap loses everything. Soft deletion kept forever: fails the right to erasure. Emailing the export as a link: needs signed, expiring storage for personal data; the direct download avoids holding a copy at all.

## Consequences

Backups still hold erased data until they expire (7 days on staging); the privacy notice must say so. A person who changes their mind after the date has to sign up again. Adding a module that stores personal data now means adding it to the export and checking its foreign key cascades.
