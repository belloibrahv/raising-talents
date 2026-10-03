# Raising Talents

A mobile marketplace where talent (athletes, musicians, models, actors and creators) show their work, and verified agents and scouts discover and contact them.

Read [docs/DESIGN.md](docs/DESIGN.md) before you write code. It links to the full system design and gives a short reading order.

## What is in this repository

```
apps/
  api/              NestJS backend. One codebase, three processes: api, worker, realtime (milestone 4)
  web/              The MVP: a progressive web app (React, Vite, Workbox). See ADR-023
  mobile/           Expo app (SDK 57, Expo Router), parked until native work resumes
packages/
  contracts/        Zod schemas and error codes shared by the API and the app
  config/           Shared TypeScript, lint and writing-check configuration
infra/
  docker/           Local Postgres, Redis, Typesense, Mailpit and S3
  terraform/        AWS infrastructure, written for OpenTofu (see infra/terraform/README.md)
docs/
  adr/              Architecture decision records
  runbooks/         What to do when an alert fires
```

Each backend module under `apps/api/src/modules` has the same four layers:

| Layer            | Holds                                          | May import                 |
| ---------------- | ---------------------------------------------- | -------------------------- |
| `domain`         | Entities, rules, events, repository interfaces | Nothing outside the domain |
| `application`    | Use cases and the ports they need              | Domain                     |
| `infrastructure` | Database, crypto, email and outside services   | Application and domain     |
| `interface`      | HTTP controllers                               | Application                |

Modules talk to each other only through a facade (for example `AccountsFacade`) or through events in the outbox.

## Run it locally

You need Node 22, pnpm 10 and Docker.

```bash
pnpm install
pnpm dev:infra                          # Postgres, Redis, Typesense, Mailpit, S3 (LocalStack)
cp apps/api/.env.example apps/api/.env
pnpm --filter @rt/api keys:generate     # paste the three lines into apps/api/.env
openssl rand -hex 32                    # paste as VERIFICATION_CODE_PEPPER
pnpm --filter @rt/api db:migrate
pnpm --filter @rt/api dev               # API on http://localhost:3000
pnpm --filter @rt/api dev:worker        # in a second terminal: sends emails and publishes events
```

Emails land in Mailpit at http://localhost:8025. Uploads go to S3 on port 4569 (LocalStack), which creates the media bucket with the same upload rules, size limits and CORS as staging. Its files are gone when the container restarts.

The web app, in a third terminal:

```bash
pnpm --filter @rt/web dev               # http://localhost:5173
```

It calls the API at `VITE_API_URL` (default http://localhost:3000). The API must list the web app's address in `WEB_ORIGINS`, which `.env.example` already does for `http://localhost:5173`. Open the app at `localhost`, not `127.0.0.1`: the session cookie needs the same site as the API.

To try the installable build and the offline start, run `pnpm --filter @rt/web build`, then `pnpm --filter @rt/web preview` (http://localhost:4173, which you then add to `WEB_ORIGINS`).

Then the app, in a third terminal:

```bash
pnpm --filter @rt/mobile dev
```

The app uses native modules (secure storage, fonts), so it runs in a development build, not Expo Go. Create one once with `eas build --profile development`, install it on your phone or simulator, and it connects to Metro from then on. In development the app finds the API on the same machine that runs Metro, so a phone on the same Wi-Fi works without setup.

Try it:

```bash
curl -X POST http://localhost:3000/v1/auth/sign-up \
  -H 'content-type: application/json' \
  -d '{"email":"ngozi.adeyemi@example.com","password":"runway-lagos-fashion-week","dateOfBirth":"1999-11-23","countryCode":"NG","acceptedTerms":true,"deviceId":"0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b"}'
```

## Everyday commands

| Command                             | What it does                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm test`                         | Unit, use case and HTTP end-to-end tests                             |
| `pnpm lint`                         | Strict type-aware lint                                               |
| `pnpm typecheck`                    | TypeScript across every package                                      |
| `pnpm check:writing`                | Checks docs, comments, emails and app copy against the writing rules |
| `pnpm --filter @rt/api db:generate` | Creates a SQL migration from schema changes. Commit the file         |

## Observability

Tracing and error tracking are off unless configured, so local development needs nothing.

| Signal                          | Where it goes                             | Turned on by                           |
| ------------------------------- | ----------------------------------------- | -------------------------------------- |
| Traces                          | Grafana Cloud through OpenTelemetry       | `OTEL_EXPORTER_OTLP_ENDPOINT`          |
| Errors from the API and worker  | Sentry                                    | `SENTRY_DSN`                           |
| Errors and crashes from the app | Sentry                                    | `EXPO_PUBLIC_SENTRY_DSN` in `eas.json` |
| Logs                            | stdout as JSON, collected by the platform | always on                              |

How the pieces connect:

- One trace follows a request through the API and into the worker. Each outbox row stores the trace context of the request that created it.
- Every log line inside a request carries `trace_id`. Every error response carries `traceId` and every response an `x-trace-id` header, so a support ticket quoting one leads to the logs and the trace.
- Sentry events from the API carry a `trace_id` tag. App events for server errors carry `api_trace_id`.
- Nothing personal is sent: no request bodies, no local variables, no cookies or auth headers, no SQL values, and Redis spans record only the command name. Tests pin these settings.

The API's processes load telemetry with `node --import ./dist/instrument.js` before the application, which `pnpm start` already does.

## API reference

Every route is listed once, in `packages/contracts/src/endpoints.ts`. From that list:

- the app calls endpoints by name: `api.call('me.selectRole', { body: { role: 'agent' } })`, typed and validated,
- `packages/contracts/openapi.json` is generated on build. Open it in any OpenAPI viewer, for example Swagger Editor,
- an API test fails if a controller and the list disagree.

To add an endpoint: add it to the list, build `@rt/contracts`, write the controller, and commit the regenerated `openapi.json`.

## Web app structure

```
apps/web/src/
  app/              Routes, the area gates that enforce the onboarding order, the query client
  features/auth/    Welcome, sign up, sign in, email code, role choice
  shared/api/       The HTTP client: access token in memory, refresh cookie, one refresh across tabs
  shared/session/   Who is signed in, shared with other tabs over a BroadcastChannel
  shared/pwa/       Update prompt, install offer, offline banner
  shared/ui/        Design tokens as CSS variables, and accessible form components
  i18n/en.json      Every word the app shows. Checked by the writing check
```

Every screen moves focus to its heading when it opens, every field has a label tied to its hint and error, and tests run axe against each screen.

## Mobile app structure

```
apps/mobile/src/
  app/              Screens and routes (Expo Router). Guards decide which screens exist for each stage
  features/auth/    Session state, auth calls, onboarding order
  shared/api/       The HTTP client: tokens, single refresh, error parsing
  shared/storage/   Keychain storage for tokens and the install's device id
  shared/ui/        Design tokens and components
  i18n/en.json      Every word the app shows. Checked by the writing check
```

Onboarding is a strict order: sign up, verify email, choose a role, then the app. Screens for a later stage are not mounted until the person reaches it.

## Tests

| Level            | Where                                    | Runs against                                                                                                    |
| ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Domain           | `src/modules/*/domain/*.test.ts`         | Plain objects                                                                                                   |
| Use case         | `src/modules/*/application/*.test.ts`    | In-memory adapters from each module's `testing` folder                                                          |
| Adapter contract | `src/modules/*/infrastructure/*.test.ts` | Real Argon2, real JWT signing, real crypto, real Typesense when `TYPESENSE_URL` is set                          |
| HTTP end to end  | `test/*.e2e.test.ts`                     | The real NestJS and Fastify stack with in-memory adapters                                                       |
| Web app          | `apps/web/src/**/*.test.{ts,tsx}`        | Screens through the real router, with axe; the HTTP client against a fake API and cookie jar shared by two tabs |
| Mobile logic     | `apps/mobile/src/**/*.test.ts`           | HTTP client against a fake API with single-use refresh tokens, routing, forms, copy                             |
| Mobile bundle    | `pnpm --filter @rt/mobile bundle:check`  | Metro builds the iOS and Android bundles, as EAS does                                                           |
| Route contract   | `apps/api/test/routes.contract.test.ts`  | Every served route matches the endpoint catalogue                                                               |

## How we work

- Branch from `main`, open a pull request, get one review. CI must pass.
- Commit messages follow Conventional Commits (`feat(identity): ...`). Lefthook checks this locally.
- Schema changes are SQL migrations that follow expand and contract: add first, backfill, switch, then remove in a later release.
- Writing rules apply to everything people read: no em dashes, en dashes or double hyphens in prose, no filler words, and real content in examples. The rules live in `packages/config/writing-rules.json`.

## Status

Milestone 1, foundations.

| Area                                                                                                                    | State                                    |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Monorepo, contracts, shared config                                                                                      | Done                                     |
| Backend platform: config, logging, errors, unit of work, outbox with backoff, rate limits, health                       | Done                                     |
| Accounts: age gate, account status, role choice                                                                         | Done                                     |
| Identity: sign up, sign in, refresh rotation with reuse detection, sign out, email codes, password reset                | Done                                     |
| Mobile app shell: welcome, sign up, sign in, email code, role choice, session restore                                   | Done                                     |
| Endpoint catalogue, OpenAPI document and typed app client                                                               | Done                                     |
| Tracing across API and worker, error tracking for API, worker and app                                                   | Done                                     |
| Staging infrastructure, container image and deploy pipeline                                                             | Done, not yet applied to an AWS account  |
| Milestone 2: taxonomy, talent and agent profiles with versioned updates and onboarding completion                       | Done                                     |
| Milestone 2: image pipeline (direct upload, metadata stripping, WebP variants, scanning) and approved avatars           | Done                                     |
| Milestone 2: portfolio items (add, caption, reorder with If-Match, remove with media cleanup, public view)              | Done, limits provisional (ADR-020)       |
| Milestone 2: video through Mux (direct upload, signed webhooks, frame scanning, signed playback)                        | Done, limits provisional (ADR-021)       |
| Milestone 2: scheduled cleanup of abandoned uploads                                                                     | Done                                     |
| PWA (ADR-023): browser sessions with an HttpOnly refresh cookie (ADR-024), CORS                                         | Done                                     |
| PWA: installable shell, offline start, update prompt, sign up, sign in, email code, role choice                         | Done                                     |
| PWA: talent wizard, agent profile, profile photo, portfolio (photos and video), public talent page                      | Done                                     |
| PWA: hosting on S3 and CloudFront with a strict CSP, deploy pipeline                                                    | Done, not yet applied to an AWS account  |
| Milestone 3: talent search (Typesense, event-driven indexing, rebuild, agent search screen)                             | Done; hosting needs a decision (ADR-025) |
| Moderation: staff accounts, held media queue, approve or reject with an audit trail                                     | Done                                     |
| Agent verification: request with evidence, moderator queue, badge (ADR-026)                                             | Done, evidence rules provisional         |
| Notifications: emails for moderation and verification decisions, sent once per event                                    | Done                                     |
| Privacy: data export, account deletion with a grace period and scheduled erasure (ADR-027)                              | Done, grace period provisional           |
| Safety: member reports, moderator queue, suspend and ban with sign-out and email, operator reinstate (ADR-028)          | Done, categories provisional             |
| PWA design system: shadcn/ui on Tailwind, brand tokens, dark scheme, bottom tab bar on phones (ADR-029)                 | Done                                     |
| Shortlists: agents save talent with private notes, in the data export (ADR-030)                                         | Done, limit provisional                  |
| Account security: change password, signed-in devices, sign out devices, change email (ADR-031, ADR-034)                 | Done                                     |
| Notification inbox: bell with unread count, inbox page, 180-day retention, in the data export (ADR-032)                 | Done                                     |
| Quality: Lighthouse in CI (performance 85+, accessibility and best practices 100) on a CloudFront-like server (ADR-033) | Done                                     |
| Resilience: web error reporting (Sentry, opt-in), error screens per route, loading skeletons (ADR-035)                  | Done, Sentry project needed              |
| Hosting on Railway: one public origin, private API, bucket media, manual photo review (ADR-036)                         | Code ready; services blocked on plan     |
| CI: lint, types, tests, build, drift checks, audit, secret scan, infrastructure checks                                  | Done                                     |
