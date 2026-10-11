# ADR-051: Reporting a post

- Status: Accepted
- Date: 2026-10-11

## Context

Posts go live without a check first (ADR-048), and members could report only a whole
profile. A moderator then had to guess which of someone's posts was meant, and a member who
saw one bad photo had no direct way to say so. ADR-048 named this as the next step.

## Decision

- **A third thing to report.** `POST /v1/reports` takes `{ kind: 'post', postId }` beside a
  profile and a conversation. The report is about the post's owner, as every report is about
  an account, and it also records the post's photo or video (`media_id`).
- **One per post.** A person has one open report per account, and one more per post, so two
  bad posts by one talent can both be reported. The daily limit of ten covers all kinds.
- **What the moderator sees.** The reports queue stays one entry per account. The entry now
  shows the reported posts that are still live, most reported first (up to six), each with
  how often it was reported and "Remove post" (ADR-048). A post already taken down is left
  out, so the list empties as the moderator works.
- **Closing.** Removing a post does not close the reports: the moderator still dismisses
  them or suspends the account, one decision per account as before.
- **In the app.** "Report post" sits under every post for talent and agents, never on your
  own posts. Moderators see "Remove post" there instead.

## Alternatives considered

A separate queue of reported posts: two queues about the same people, and a pattern across
one account's posts is harder to see. Hiding a post automatically after a number of reports:
easy to abuse against a rival; it can be added with a threshold once there is volume.

## Consequences

- A report about a post the owner has since deleted still counts against the account, with
  nothing to show for it. The reporter's category and note remain.
- Reporters are not told the outcome, as with every report.
