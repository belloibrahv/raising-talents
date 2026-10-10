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
| `CONTENT_SCANNER`                                                           | `manual-review`                                                                                                                                                                                          |
| `VIDEO_PROVIDER`                                                            | `disabled`                                                                                                                                                                                               |
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

## Every day

The moderation queue holds every photo (`CONTENT_SCANNER=manual-review`). A moderator should clear it at least daily; grant the role with `pnpm --filter @rt/api staff:grant` run through `railway run --service api`.
