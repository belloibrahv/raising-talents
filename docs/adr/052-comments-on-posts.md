# ADR-052: Comments on posts

- Status: Accepted
- Date: 2026-10-11

## Context

Members can follow and like, but cannot say anything about a post. ADR-047 left comments
out until text could be reported and moderated. Since then posts and single posts can be
reported (ADR-051) and moderators take down what is live (ADR-048), so the pieces are there.

## Decision

- **Who writes.** Talent and agents who have finished setting up, on any post they can see.
  Moderators read and delete; they do not comment. Up to 500 characters, plain text, ten
  comments a minute per person.
- **What is shown.** Newest first, twenty a page: `GET /v1/posts/{id}/comments`. A talent is
  named with a link to their page, an agent with their agency, linked when talent can find
  them (ADR-049). Every post carries its comment count. `GET /v1/posts/{id}` returns one
  post, for the page a notice opens (`/posts/{id}` in the app).
- **Who deletes.** The author, the talent whose post it is, and moderators:
  `DELETE /v1/comments/{id}`. The row is deleted, not hidden.
- **Reporting.** `POST /v1/reports` takes `{ kind: 'comment', commentId }`. The report is
  about the author, and keeps the words with it, so the moderator reads them in the queue
  even if the comment is deleted afterwards. It shares the one open report per person and
  account with profile reports.
- **Hidden with the account.** Comments by someone suspended, banned or leaving are not
  listed or counted, and come back if the account does. Deleting the post or erasing the
  account deletes its comments (`on delete cascade`).
- **Telling the owner.** One notice in the app per comment, never an email, and none for
  comments on your own post.
- **Privacy.** A person's data export lists the comments they wrote.
- **Storage.** `social.comments` with an index on `(item_id, created_at, id)` for the page
  and the count, and `(author_id, created_at)` for the export. Counts are computed for a
  page of posts in one grouped query, as likes are.

## Not done, on purpose

- **Replies and likes on comments.** One flat list is enough while threads are short.
- **Editing.** Delete and write again.
- **Checking words automatically.** Reports and moderators come first; a word filter can be
  added in front of `AddCommentHandler` without changing the API.
- **Stopping one person from commenting on your posts.** The owner deletes what they do not
  want and reports the person; a block list is the next step if this is not enough.

## Consequences

- A post's owner can be told about many comments in a short time. If that becomes noise,
  notices for one post are grouped; the stored notices already name the post.
- The count is one more grouped query per feed page. If it shows up in timings, a stored
  counter replaces it and the API does not change.
