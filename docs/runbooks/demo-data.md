# Demo data

Demo people for testing the workflows on a live environment. All of them use the
`@demo.raisingtalents.app` domain, which receives no mail, and share one password.

| Who                     | Email                                 | State                                        |
| ----------------------- | ------------------------------------- | -------------------------------------------- |
| Moderator               | `moderator@demo.raisingtalents.app`   | Approves photos and agencies once granted    |
| Agent, verified agency  | `tunde@demo.raisingtalents.app`       | Eko Talent Partners; chatting with Ngozi     |
| Agent, pending          | `kemi@demo.raisingtalents.app`        | Northstar Scouting; verification requested   |
| Talent (public link on) | `ngozi@demo.raisingtalents.app`       | Singer, Lagos; accepted Tunde's request      |
| Talent                  | `zainab@demo.raisingtalents.app`      | Model, Abuja; Tunde's request is waiting     |
| Talent                  | `emeka@`, `amaka@`, `tobi@`, `funmi@` | Complete profiles with photos and portfolios |
| Talent, onboarding      | `chidi@demo.raisingtalents.app`       | Stopped after the first steps                |

Photos are generated illustrations, not real people.

## Seeding

The seed runs inside the worker and goes through the API like a person would: sign-up,
onboarding, uploads, scanning, moderation, agency verification and messaging. It writes
nothing to the database directly.

1. Make sure `api` and `worker` have `EMAIL_VERIFICATION=off` (ADR-045).
2. On `worker`, set `SEED_DEMO=run` and `SEED_DEMO_PASSWORD` (12 or more characters; keep it
   somewhere private). Saving the variables redeploys the worker, which seeds on start. The
   worker log ends with "demo data is in place" and a list of who was created.
3. Photos and agencies wait for a moderator, as anyone's would. An operator makes the demo
   moderator a moderator by setting `STAFF_GRANT=moderator@demo.raisingtalents.app=moderator`
   on `worker` (see railway.md). The worker applies it on the next start, and the seed then
   approves the photos, verifies Eko Talent Partners and starts the two conversations.
4. When it is done, remove `SEED_DEMO` and `SEED_DEMO_PASSWORD`, so later deploys skip it.
   Running it again is harmless: anything already in place is left alone.

## Removing

Set `SEED_DEMO=remove` on `worker`. On start it erases every demo account and its files, the
same way account deletion does, and logs "demo data removed". Then remove the variable.
