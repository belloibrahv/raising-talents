# ADR-048: Posting without a check first

- Status: Accepted
- Date: 2026-10-11

## Context

On Railway every photo waited for a moderator before anyone else could see it
(`CONTENT_SCANNER=manual-review`, ADR-036), because there is no automatic scanner there. A
new talent's profile stayed hidden until someone cleared the queue, and so did every post.
The client asked for the opposite: posting must not wait for a moderator, who should instead
be able to limit or block what has been posted. That is how the large social apps work, and
it keeps the product simple.

## Decision

- **Publish first.** `CONTENT_SCANNER=off` is a production setting. A profile photo or post
  goes live as soon as it is processed. It is a stated choice, unlike the development
  scanners, which stay refused outside development.
- **The old queue is released.** With the scanner off, the worker publishes what manual
  review was holding (`media.release-unscanned`, at start and every ten minutes). It
  releases only files held for want of a scanner; anything Rekognition flagged stays in the
  queue for a person. No moderator is recorded on a released file and the owner gets no
  notice: the photo is simply on the profile.
- **Moderators take down.** `POST /v1/moderation/media/{mediaId}/removal` with a reason
  removes a photo or video that is live. It ends like a rejection: the files are deleted, the
  post leaves every feed and profile, and the owner is told which rule it broke. A removed
  profile photo comes off the profile, which hides it from others until a new photo is sent.
  The moderator and the time are kept on the file and in the log (`published media removed`).
- **In the app.** Moderators see "Remove post" under a post and "Remove profile photo" on a
  profile; nobody else does. They have Explore in their menu to look around, and the reports
  queue links to each reported profile.
- **Unchanged.** Members report profiles and conversations; moderators suspend or ban
  accounts, which hides everything of theirs at once. Agencies are still verified by a
  moderator before an agent can write to anyone.

## Alternatives considered

Keeping manual review and staffing the queue: safe, but it is the delay the client wants
gone. Rekognition from Railway with AWS keys: scans automatically and holds only what looks
wrong. It remains the better long-term answer and needs no code change, only
`CONTENT_SCANNER=rekognition` and credentials.

## Consequences

- Nothing looks at a photo before the public does. Something that breaks the rules stays up
  until a member reports it or a moderator sees it, so the reports queue matters more and
  someone should read it daily.
- Posts cannot be reported one by one yet, only the profile. Reporting a single post is the
  natural next step.
- Returning to a check first is a setting: `rekognition` or `manual-review`. Files already
  live stay live.
