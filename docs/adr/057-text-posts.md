# ADR-057: Posts that are only words

- Status: Accepted
- Date: 2026-10-12
- Builds on: ADR-020 (portfolio), ADR-047 (a post is a portfolio item), ADR-051, ADR-052

## Context

A post had to be a photo, a video or a recording. The client asked for talent to be able to
post words on their own: an announcement, a result, a thank-you.

## Decision

- **A text post is a portfolio item with no file.** `kind: 'text'`, `media_id` null
  (migration 0034), and the caption is the post: 1 to 500 characters. It is live as soon as
  it is saved, since there is nothing to upload or wait for.
- **Posting.** `POST /v1/me/portfolio/texts` with `{ text }`. Talent only, like every post.
  The words can be edited with the same call that edits a caption, and cannot be emptied.
  Captions on files keep their limit of 300.
- **Everywhere a post goes.** The feed, the post's page, the profile grid and the shared
  page show the words. Likes, comments and reports work as for any post.
- **Reporting and removal.** A report about a text post keeps its words for the moderator,
  as a report about a comment does (ADR-052). A moderator removes it with
  `POST /v1/moderation/posts/{id}/removal`. Posts with a file are still taken down through
  their file, which deletes it and tells the owner which rule it broke.
- **The limit.** A text post takes one of the portfolio's 30 places.

## Not done, on purpose

- **Telling the owner when a moderator removes a text post.** Media removals carry a reason
  to the owner; this one does not yet.
- **Links, mentions and hashtags.** Text is shown as written.
- **A higher limit.** Thirty posts in all is small for a feed. Raising it is one constant;
  it waits for the client's word on how the portfolio and the feed should differ.

## Consequences

- The feed's query joins files loosely now: an item is shown when it has no file or its
  file is ready.
- Anything that assumed every post has a file (`mediaId`) must allow null. The contracts
  say so.
