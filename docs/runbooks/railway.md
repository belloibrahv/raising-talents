# Runbook: Raising Talents on Railway

The app runs on Railway (ADR-036): project `raising-talents`, environment `production`.

## Services

| Service             | Source                                           | Public            | Notes                                              |
| ------------------- | ------------------------------------------------ | ----------------- | -------------------------------------------------- |
| `web`               | `apps/web/Dockerfile.railway`                    | Yes, the only one | Serves the app, passes `/v1` and `/media` to `api` |
| `api`               | `apps/api/Dockerfile.railway`, `APP_ROLE=api`    | No                | Migrates at start                                  |
| `worker`            | `apps/api/Dockerfile.railway`, `APP_ROLE=worker` | No                | Outbox relay and scheduled jobs                    |
| `Postgres`, `Redis` | Railway databases                                | No                | Reached at `*.railway.internal`                    |
| `typesense`         | `typesense/typesense:28.0`, volume at `/data`    | No                | Search index                                       |
| bucket `media`      | Railway bucket                                   | No                | Private; uploads by presigned POST                 |

## Variables

`api` and `worker` share these (Railway "shared variables" or set on both):

| Variable                                                                    | Value                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                  | `production`                                                                                                                                                                                             |
| `HOST`                                                                      | `::`                                                                                                                                                                                                     |
| `DATABASE_URL`                                                              | `${{Postgres.DATABASE_URL}}` (the private one)                                                                                                                                                           |
| `DATABASE_SSL`                                                              | `disable` (private network only; the config refuses it elsewhere)                                                                                                                                        |
| `REDIS_URL`                                                                 | `${{Redis.REDIS_URL}}`                                                                                                                                                                                   |
| `JWT_PRIVATE_KEY_BASE64`, `JWT_PUBLIC_KEY_BASE64`, `JWT_KEY_ID`             | From `pnpm --filter @rt/api keys:generate`, never committed                                                                                                                                              |
| `JWT_ISSUER`                                                                | The web address                                                                                                                                                                                          |
| `VERIFICATION_CODE_PEPPER`                                                  | `openssl rand -hex 32`                                                                                                                                                                                   |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`        | From the email provider                                                                                                                                                                                  |
| `EMAIL_VERIFICATION`                                                        | `off` while testing without email (ADR-045), on `api` and `worker`. Set `required` before launch, once SMTP works                                                                                        |
| `STAFF_GRANT`                                                               | On `worker` only: `email=role` (moderator or admin), several separated by commas. Applied on the next start, because the image has no shell for `staff:grant`. Remove it once applied                    |
| `SEARCH_REBUILD`                                                            | On `worker` only: `run` rebuilds the search index on the next start, because the image has no shell for `search:rebuild`. Needed after a release that renames categories or cities. Remove it afterwards |
| `SEED_DEMO`, `SEED_DEMO_PASSWORD`                                           | On `worker` only, while seeding or removing demo data (demo-data.md). Remove them afterwards                                                                                                             |
| `MEDIA_BUCKET`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | From `railway bucket credentials --bucket media`                                                                                                                                                         |
| `AWS_REGION`                                                                | `auto`                                                                                                                                                                                                   |
| `MEDIA_DELIVERY`                                                            | `api`                                                                                                                                                                                                    |
| `MEDIA_CDN_URL`                                                             | The web address (images come back through the web server)                                                                                                                                                |
| `CONTENT_SCANNER`                                                           | `off`: posts and profile photos go live at once (ADR-048). `manual-review` holds every photo for a moderator                                                                                             |
| `VIDEO_PROVIDER`                                                            | `storage`                                                                                                                                                                                                |
| `SEARCH_INDEX`, `TYPESENSE_URL`, `TYPESENSE_API_KEY`                        | `typesense`, `http://typesense.railway.internal:8108`, the typesense service's key                                                                                                                       |
| `WEB_ORIGINS`, `WEB_APP_URL`                                                | The web address                                                                                                                                                                                          |
| `TRUST_PROXY`                                                               | `false`                                                                                                                                                                                                  |
| `PROXY_SECRET`                                                              | `openssl rand -hex 32`, the same value on `web`. Every service on the private network can reach the API, so only a request carrying this may name the client address that rate limits count against      |

`api` also sets `APP_ROLE=api`, `MIGRATE_ON_START=true` and `PORT=8080`; `worker` sets `APP_ROLE=worker`.

`web` sets `PORT=8080`, `PROXY_SECRET` (as above), `API_UPSTREAM=http://api.railway.internal:8080`, `API_ORIGIN`, `MEDIA_ORIGIN`, `PUBLIC_ORIGIN` (all three the web address; `PUBLIC_ORIGIN` makes link previews absolute, ADR-043), `UPLOAD_ORIGIN` (the bucket's address, `https://<bucket>.t3.storageapi.dev`) and the build argument `VITE_API_URL` (the web address).

`typesense` sets `TYPESENSE_API_KEY` (shared with `api` and `worker`), `TYPESENSE_DATA_DIR=/data`, `TYPESENSE_THREAD_POOL_SIZE=8` and `TYPESENSE_NUM_COLLECTIONS_PARALLEL_LOAD=2`. Without the thread settings Typesense sizes its pool from the host's CPU count, which a container on Railway sees in full, and crashes at start trying to open more threads than the container allows.

## Deploy

Name the release first, so error reports and logs say which commit is running:

```bash
release=$(git rev-parse HEAD)
railway variables --service api --set "APP_VERSION=$release"
railway variables --service worker --set "APP_VERSION=$release"
railway variables --service web --set "VITE_RELEASE=$release"
railway up --service api --detach
railway up --service worker --detach
railway up --service web --detach
```

Set `RAILWAY_DOCKERFILE_PATH` on each service to its Dockerfile. After the first deploy, allow the app's origin on the bucket once:

```bash
pnpm --filter @rt/api storage:cors https://<web address>
```

## When the web address changes

Renaming the web service's domain, or adding a custom one, breaks the app until five
settings follow it. The old address stops answering, the browser refuses the API call
(the console shows a CORS error) and the app says "You are offline".

1. On `web`: set `VITE_API_URL` and `PUBLIC_ORIGIN` to the new address, then deploy it
   again. The API address is built into the app, so a restart is not enough.
2. On `api` and `worker`: set `WEB_ORIGINS`, `WEB_APP_URL` and `MEDIA_CDN_URL` to the new
   address. Saving restarts them.
3. Allow uploads from the new address on the bucket:

   ```bash
   railway run --service api pnpm --filter @rt/api storage:cors https://<new address>
   ```

4. Open the new address and check the console is clean and sign-in works, and that
   profile photos load: a photo address that does not answer shows a broken image on
   every profile while everything else works.

Use the address that answers, exactly. `MEDIA_CDN_URL` is put in front of every photo, so
`https://www.<domain>` breaks all photos if only `https://<domain>` is set up (check with
`railway domain --service web`, and that the name resolves). Set the same values on
`worker` as on `api`: the worker sends every email and writes the links in them, so a
worker left on the old address sends links that go nowhere.

To keep both addresses working for a while, give `WEB_ORIGINS` and `storage:cors` both,
separated by a comma and a space respectively. The app itself calls one address only.

## After every deploy

Check the live site, not only the build:

1. All three services show `SUCCESS` (`railway deployment list --service web|api|worker`), the
   API log says `Migrations applied` and `api process listening`, and the worker log says
   `worker process started` with no errors after it.
2. Walk the site as the demo people (docs/runbooks/demo-data.md):

   ```bash
   cd tools/live-check && npm install
   PASSWORD=<demo password> node live-check.mjs
   ```

   It signs in as a demo talent, agent and moderator and goes through the feed, Explore,
   Agents, saving an agent, a submission, reporting a post and the moderator's queue, and
   prints PASS or FAIL for each step. It acts only on demo accounts, and dismisses the one
   report it files.

3. After a change to how screens are laid out, try to slide them sideways as a phone would
   (ADR-058). Use a test account, never a member's:

   ```bash
   cd tools/phone-check && npm install
   BASE=https://raisingtalents.up.railway.app EMAIL=<test account> PASSWORD=<its password> \
     node phone-check.mjs /home /search /messages /account
   ```

## Email

The worker sends every email: sign-in codes, password resets, and notices about requests
and verification. It needs `EMAIL_FROM` and the four `SMTP_` variables, the same as `api`.
Reference them from `api` (for example `SMTP_PASSWORD=${{api.SMTP_PASSWORD}}`) so there is one
copy. When they are missing, the worker log shows `Outbox event handler failed` for each
email and, after ten tries, `dead-lettered` (outbox-dead-letter.md).

`EMAIL_FROM` must be on a domain the provider has verified. With Resend, add the domain in
its dashboard, put the DNS records it gives at the domain's DNS host, and wait for it to
show Verified. Until then Resend delivers only to the Resend account's own address. Then set
`EMAIL_FROM=Raising Talents <no-reply@<domain>>` on `api` (and `worker`, by reference).

To check, ask for a password reset for an address you can read, and watch the worker log.

## Every day

Posts and profile photos go live without a check first (`CONTENT_SCANNER=off`, ADR-048), so a moderator should read the reports queue at least daily and take down what breaks the rules: "Remove post" under a post, "Remove profile photo" on a profile. Grant the role with `STAFF_GRANT` on `worker` (above).

To go back to a check first, set `CONTENT_SCANNER=manual-review` on `api` and `worker`: every new photo then waits in the moderation queue. Setting it to `off` again publishes whatever is waiting.
