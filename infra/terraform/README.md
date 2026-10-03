# Infrastructure

Everything that runs Raising Talents on AWS, written for OpenTofu (ADR-018). Nothing is created by hand in the console.

## Layout

```
bootstrap/                  Once per account: state bucket, state key, GitHub OIDC roles
environments/staging/       Composes the modules for staging
modules/
  network/                  VPC, public and private subnets, NAT, S3 endpoint, flow logs
  ecr/                      Image repository: immutable tags, scanning, lifecycle
  database/                 Postgres on RDS: managed password, forced TLS, backups, insights
  cache/                    Valkey: TLS required, auth token never stored in state
  ecs-service/              One Fargate service or task: roles, security group, scaling
  edge/                     Certificate, load balancer, WAF, access logs, DNS
  media/                    Private media bucket behind CloudFront
  alarms/                   Alerts by email, dead-letter alarm, monthly budget
```

## What staging runs

```
Internet ─▶ WAF ─▶ Load balancer (HTTPS) ─▶ API tasks ──▶ Postgres (RDS)
                                                    └───▶ Valkey
                     Outbox ─▶ Worker task ─▶ SES email
Media ─▶ CloudFront ─▶ S3 (private)
```

All tasks run on Fargate ARM64 in private subnets. The worker uses Fargate Spot in staging.

## Security choices

- No database, cache or email password exists in the repository, in GitHub or in OpenTofu state. RDS manages its own password, the Valkey token is write-only, and email uses the worker's IAM role.
- CI signs in to AWS with short-lived OIDC tokens. Plans are read-only; applies and deploys run only from the protected `staging` environment.
- One KMS key per environment encrypts the database, cache, secrets, logs and images. State is encrypted on the client by OpenTofu.
- Task containers run as a non-root user on a read-only filesystem, with outbound traffic limited to HTTPS and the in-VPC database and cache.
- The API requires verified TLS to Postgres and TLS to Valkey in staging and production, and refuses to start without them.

## Checks on every pull request

| Check                       | What it catches                                                |
| --------------------------- | -------------------------------------------------------------- |
| `tofu fmt`                  | Formatting drift                                               |
| `tofu validate`             | Wrong types, missing arguments, broken references              |
| TFLint with the AWS ruleset | Invalid instance types, undocumented variables, unused code    |
| Checkov                     | Missing encryption, public exposure, weak IAM, missing logging |
| `tofu plan`                 | The exact change, shown in the job summary                     |

A Checkov finding is either fixed or skipped with a written reason next to the resource (`#checkov:skip=...`). Review those reasons like code.

## Day to day

- Change infrastructure: edit, open a pull request, read the plan, merge, approve the apply.
- Release the application: merge to main. CI runs, then the deploy workflow migrates and rolls out (`scripts/deploy-ecs.sh`).
- Roll back: run the Deploy staging workflow by hand on an earlier commit. Images are immutable and the last 30 are kept.

First deploy: follow [docs/runbooks/staging-first-deploy.md](../../docs/runbooks/staging-first-deploy.md).
