# Demo data

Demo people for testing the workflows on a live environment. All of them use the
`@demo.raisingtalents.app` domain, which receives no mail, and share one password.

| Who                     | Email                                 | State                                         |
| ----------------------- | ------------------------------------- | --------------------------------------------- |
| Moderator               | `moderator@demo.raisingtalents.app`   | Verifies agencies, removes posts once granted |
| Agent, verified agency  | `tunde@demo.raisingtalents.app`       | Eko Talent Partners; chatting with Ngozi      |
| Agent, pending          | `kemi@demo.raisingtalents.app`        | Northstar Scouting; verification requested    |
| Talent (public link on) | `ngozi@demo.raisingtalents.app`       | Singer, Lagos; accepted Tunde's request       |
| Talent                  | `zainab@demo.raisingtalents.app`      | Model, Abuja; Tunde's request is waiting      |
| Talent                  | `emeka@`, `amaka@`, `tobi@`, `funmi@` | Complete profiles with photos and portfolios  |
| Talent, onboarding      | `chidi@demo.raisingtalents.app`       | Stopped after the first steps                 |

Photos are generated illustrations, not real people.

## Seeding

The seed runs inside the worker and goes through the API like a person would: sign-up,
onboarding, uploads, scanning, moderation, agency verification and messaging. It writes
nothing to the database directly.

1. Make sure `api` and `worker` have `EMAIL_VERIFICATION=off` (ADR-045).
2. On `worker`, set `SEED_DEMO=run` and `SEED_DEMO_PASSWORD` (12 or more characters; keep it
   somewhere private). Saving the variables redeploys the worker, which seeds on start. The
   worker log ends with "demo data is in place" and a list of who was created.
3. With `CONTENT_SCANNER=off` (ADR-048) the photos are live at once, so the profiles, posts,
   follows and likes are all in place after this one run. Agencies still wait for a
   moderator, as anyone's would. An operator makes the demo moderator a moderator by setting
   `STAFF_GRANT=moderator@demo.raisingtalents.app=moderator` on `worker` (see railway.md).
   The worker applies it on the next start, and the seed then verifies Eko Talent Partners
   and starts the two conversations (and approves the photos where they are held).
4. When it is done, remove `SEED_DEMO` and `SEED_DEMO_PASSWORD`, so later deploys skip it.
   Running it again is harmless: anything already in place is left alone.

The last step makes the feed look lived in (ADR-047): the demo talent follow and like each
other, and Tunde follows three of them. An environment seeded before follows existed gets
them by running the seed once more: set `SEED_DEMO=run` and `SEED_DEMO_PASSWORD` again, let
the worker restart, then remove them.

## Removing

Set `SEED_DEMO=remove` on `worker`. On start it erases the demo talent and agents and their
files, the same way account deletion does, and logs "demo data removed" with the addresses.
Then remove `SEED_DEMO` and `SEED_DEMO_PASSWORD`, or the next start does it again.

- Only the addresses in the table above are erased. No other account is touched, whatever
  its email domain.
- The demo moderator is kept, because it may be the only moderator there is. Keep
  `STAFF_GRANT` while you rely on it. `SEED_DEMO=remove-all` erases it as well: do that only
  once a real person has been made a moderator.
- Everything of theirs goes with them: posts, likes, follows, comments, conversations with
  real members, and reports about them. It cannot be undone; `SEED_DEMO=run` creates fresh
  ones.
- The check in `tools/live-check` signs in as the demo talent, agent and moderator, so it
  cannot run after this until it is given other accounts.
