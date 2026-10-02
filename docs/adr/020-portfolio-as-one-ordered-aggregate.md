# ADR-020: Portfolio as one ordered aggregate per talent

Status: Proposed. The limits below wait for client sign-off on section 6 of the design.

## Context

Talent show their work as an ordered set of images, with video to follow through Mux (ADR-007). The app needs to add, caption, reorder and remove items, and agents must only ever see media that passed the scan. Two phones signed in to the same account can change the portfolio at the same time.

## Decision

A `portfolio` module owns one `Portfolio` aggregate per talent: a root row (`portfolio.portfolios`) with a version, and its items (`portfolio.items`) in display order. Every change locks the root row, so the item limit and the order are checked against one consistent state.

Provisional rules:

- Up to 30 items. A caption is optional, up to 300 characters.
- An item points at one `portfolio` media asset owned by the same talent. One asset can back one item only.
- An item can be added once the upload is confirmed, while the image is still processing or scanning, so the app does not wait. Rejected, failed and deleted media are refused.
- The owner sees every item with its media status and any rejection reason. Everyone else sees ready media only, behind the same 404 rules as the public profile.
- Reordering replaces the whole order and needs `If-Match`, because a stale full list would undo another device's change. Adding, captioning and removing apply to one item and do not need it.
- Removing an item deletes its media in the same transaction. The worker removes the files from storage after `media.MediaDeleted`.

The portfolio reads media through `MediaFacade` and visibility through `TalentDirectory`, never their tables.

## Alternatives considered

Items as independent rows with a fractional position column: cheaper reorders, but the item limit and concurrent reorders need extra locking. Keeping items inside the talent profile aggregate: one version for profile and portfolio would make every caption edit conflict with profile edits.

## Consequences

A reorder rewrites at most 30 rows, which is cheap. Changing the limits is a constant in `@rt/contracts` and needs no migration. Video adds a value to the item kind enum and a provider check, without changing the aggregate.
