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

| Variable                                                                    | Value                                                                              |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                  | `production`                                                                       |
| `HOST`                                                                      | `::`                                                                               |
| `DATABASE_URL`                                                              | `${{Postgres.DATABASE_URL}}` (the private one)                                     |
| `DATABASE_SSL`                                                              | `disable` (private network only; the config refuses it elsewhere)                  |
| `REDIS_URL`                                                                 | `${{Redis.REDIS_URL}}`                                                             |
| `JWT_PRIVATE_KEY_BASE64`, `JWT_PUBLIC_KEY_BASE64`, `JWT_KEY_ID`             | From `pnpm --filter @rt/api keys:generate`, never committed                        |
| `JWT_ISSUER`                                                                | The web address                                                                    |
| `VERIFICATION_CODE_PEPPER`                                                  | `openssl rand -hex 32`                                                             |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`        | From the email provider                                                            |
| `MEDIA_BUCKET`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | From `railway bucket credentials --bucket media`                                   |
| `AWS_REGION`                                                                | `auto`                                                                             |
| `MEDIA_DELIVERY`                                                            | `api`                                                                              |
| `MEDIA_CDN_URL`                                                             | The web address (images come back through the web server)                          |
| `CONTENT_SCANNER`                                                           | `manual-review`                                                                    |
| `VIDEO_PROVIDER`                                                            | `disabled`                                                                         |
| `SEARCH_INDEX`, `TYPESENSE_URL`, `TYPESENSE_API_KEY`                        | `typesense`, `http://typesense.railway.internal:8108`, the typesense service's key |
| `WEB_ORIGINS`, `WEB_APP_URL`                                                | The web address                                                                    |
| `TRUST_PROXY`                                                               | `true` (only `web` can reach the API)                                              |

`api` also sets `APP_ROLE=api`, `MIGRATE_ON_START=true` and `PORT=8080`; `worker` sets `APP_ROLE=worker`.

`web` sets `PORT=8080`, `API_UPSTREAM=http://api.railway.internal:8080`, `API_ORIGIN`, `MEDIA_ORIGIN` (both the web address), `UPLOAD_ORIGIN` (the bucket's address, `https://<bucket>.t3.storageapi.dev`) and the build argument `VITE_API_URL` (the web address).

## Deploy

```bash
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
