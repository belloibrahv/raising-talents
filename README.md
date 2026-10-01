# Raising Talents

A mobile marketplace where talent (athletes, musicians, models, actors and creators) show their work, and verified agents and scouts discover and contact them.

Read [docs/DESIGN.md](docs/DESIGN.md) before you write code. It links to the full system design and gives a short reading order.

## What is in this repository

```
apps/
  api/              NestJS backend. One codebase, three processes: api, worker, realtime (milestone 4)
  mobile/           Expo app (next in milestone 1)
packages/
  contracts/        Zod schemas and error codes shared by the API and the app
  config/           Shared TypeScript, lint and writing-check configuration
infra/
  docker/           Local Postgres, Redis, Typesense and Mailpit
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
pnpm dev:infra                          # Postgres, Redis, Typesense, Mailpit
cp apps/api/.env.example apps/api/.env
pnpm --filter @rt/api keys:generate     # paste the three lines into apps/api/.env
openssl rand -hex 32                    # paste as VERIFICATION_CODE_PEPPER
pnpm --filter @rt/api db:migrate
pnpm --filter @rt/api dev               # API on http://localhost:3000
pnpm --filter @rt/api dev:worker        # in a second terminal: sends emails and publishes events
```

Emails land in Mailpit at http://localhost:8025.

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

## Tests

| Level            | Where                                    | Runs against                                              |
| ---------------- | ---------------------------------------- | --------------------------------------------------------- |
| Domain           | `src/modules/*/domain/*.test.ts`         | Plain objects                                             |
| Use case         | `src/modules/*/application/*.test.ts`    | In-memory adapters from each module's `testing` folder    |
| Adapter contract | `src/modules/*/infrastructure/*.test.ts` | Real Argon2, real JWT signing, real crypto                |
| HTTP end to end  | `test/*.e2e.test.ts`                     | The real NestJS and Fastify stack with in-memory adapters |

## How we work

- Branch from `main`, open a pull request, get one review. CI must pass.
- Commit messages follow Conventional Commits (`feat(identity): ...`). Lefthook checks this locally.
- Schema changes are SQL migrations that follow expand and contract: add first, backfill, switch, then remove in a later release.
- Writing rules apply to everything people read: no em dashes, en dashes or double hyphens in prose, no filler words, and real content in examples. The rules live in `packages/config/writing-rules.json`.

## Status

Milestone 1, foundations.

| Area                                                                                              | State |
| ------------------------------------------------------------------------------------------------- | ----- |
| Monorepo, contracts, shared config                                                                | Done  |
| Backend platform: config, logging, errors, unit of work, outbox with backoff, rate limits, health | Done  |
| Accounts: age gate, account status, role choice                                                   | Done  |
| Identity: sign up, sign in, refresh rotation with reuse detection, sign out, email codes          | Done  |
| CI: lint, types, tests, build, migration drift, audit, secret scan                                | Done  |
| Mobile app shell wired to auth                                                                    | Next  |
| OpenAPI generation and typed client                                                               | Next  |
| Sentry and OpenTelemetry                                                                          | Next  |
| Terraform for staging                                                                             | Next  |
