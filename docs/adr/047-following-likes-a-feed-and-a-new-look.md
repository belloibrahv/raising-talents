# ADR-047: Following, likes, a feed, and a new look

- Status: Accepted
- Date: 2026-10-10

## Context

The client described where the product is going: "their own LinkedIn, but for talented and
creative people". Today a musician pays for ads on TikTok or Instagram to be noticed. Here
they should have a page of their own, an audience, and the agents who are looking.

Until now the app was a directory: talent filled in a profile, and agents searched it.
Talent could not find each other, nothing showed new work, and nobody could say "I like
this". The navy and yellow colours were chosen for that directory.

## Decision

**A post is a portfolio item.** Nothing new to upload or moderate: every photo or clip in a
portfolio whose file is ready appears in the feed, newest first, with its caption. Removing
the item removes the post and its likes.

**Following.** Anyone who has finished setting up, talent or agent, can follow a talent.
Agents are not followed: they have no public page. A person follows up to 5,000 talent. The
talent is told once in the app, never by email, and following again later does not repeat it.

**Likes.** One per person and post. Counts are public; who liked is not shown. A like needs
no notice: the count on the post is the feedback.

**Feed.** `GET /v1/feed?scope=discover|following`, twelve posts a page, with a cursor.
`discover` is everyone; `following` is talent the viewer follows. A row of suggestions lists
talent the viewer does not follow yet.

**Who is seen.** The same rule as a profile (ADR-037): a complete profile on an active,
verified account. Hidden talent disappear from every feed at once.

**Talent can search.** ADR-025 kept search to agents. Any signed-in person could already
open a talent's profile, so search reveals nothing new, and a social product needs it.

**One query for a page.** `DrizzlePostSource` joins the portfolio, media, talent and account
tables. That crosses module boundaries for reading only: assembling a page module by module
would cost a query per post. Each module still owns its writes. The use cases check
visibility again when they add names and files, so a row the query should not have returned
is dropped, not shown. Indexes: `portfolio.items (created_at, id)` for the feed,
`social.follows (follower_id, followed_at, talent_id)` and `(talent_id)`,
`social.likes (item_id)`.

**Limits.** 60 follows and 120 likes a minute per person.

**Privacy.** Follows and likes go with the account when it is erased. The data export lists
who the person follows.

**The look.** Clean neutral surfaces so the work carries the colour; violet (#6D28D9) for
actions; a gradient from violet through pink to orange for the mark, the ring around a face
and the stage; red for a like. Every text pair meets WCAG AA in light and dark. The mark is a
person and a spark on the gradient.

**The screens.** Home is the feed for everyone. A talent's tabs are Home, Explore, Post,
Messages and Profile; an agent's are Home, Search, Shortlist, Messages and Account. A profile
shows the photo, posts, followers and following, then the work in a grid; a square opens the
post.

## Not done, on purpose

- **Comments.** They need reporting, blocking and moderation of text before they are safe.
- **A ranked feed.** Newest first is honest and easy to reason about while there are few
  posts. Ranking can come when there is enough activity to rank.
- **Follower lists.** Who follows whom is not shown to others yet.
- **Accounts for fans.** Following needs an account as talent or agent. People without one
  see a talent through their public link (ADR-042).
- **Blocking a follower.** A talent can report a profile; removing a follower is next.

## Consequences

- Counts are computed when asked, from indexes. If a talent reaches very many followers, a
  stored counter replaces the count; the API does not change.
- The feed reads portfolio and media tables directly, so a change to those tables must keep
  `DrizzlePostSource` in step. Its end-to-end test (`test/social.e2e.test.ts`) runs against
  in-memory stores; the SQL was checked by hand against Postgres.
- Icons and the link preview image are rendered from `public/favicon.svg` by
  `pnpm --filter @rt/web icons`.
