# Runbook: first staging deploy

Follow this once, in order. Every later release is automatic: merging to main runs CI, then the deploy workflow.

## Before you start

- An AWS account for staging, and an administrator session in it (`aws sts get-caller-identity` works).
- The `raisingtalents.app` hosted zone exists in Route 53 in that account. Confirming who owns the domain is open client question 5.
- OpenTofu 1.13 installed locally.
- Decide the region (ADR-015). The configuration uses eu-west-1 until the latency test is done. Moving region later means rebuilding staging.

## 1. Lock provider versions (once)

The repository pins the AWS provider version but has no lock files yet, because they must hold
checksums for every platform the team uses. Generate them from the real registry and commit them
with your first infrastructure pull request:

```bash
for stack in infra/terraform/bootstrap infra/terraform/environments/staging; do
  tofu -chdir="$stack" providers lock \
    -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64
done
```

## 2. Bootstrap the account (once)

```bash
cd infra/terraform/bootstrap
# Set aws_account_id in bootstrap.tfvars first.
tofu init
tofu apply -var-file=bootstrap.tfvars
```

Move the bootstrap state into the bucket it just created, so it is not left on one laptop. Add this inside the `terraform` block in `bootstrap/versions.tf`, then run `tofu init -migrate-state`:

```hcl
backend "s3" {
  bucket       = "raising-talents-tofu-state-<account id>"
  key          = "bootstrap/terraform.tfstate"
  region       = "eu-west-1"
  encrypt      = true
  use_lockfile = true
}
```

## 3. Configure GitHub

In the repository settings:

- Environments: create `staging`. Add yourself as a required reviewer so infrastructure applies wait for approval.
- Variables (Settings, Secrets and variables, Actions, Variables). No secrets are needed: CI signs in to AWS with OIDC.

| Variable                  | Value                                |
| ------------------------- | ------------------------------------ |
| `TOFU_STATE_BUCKET`       | `state_bucket` output from bootstrap |
| `STAGING_AWS_REGION`      | `eu-west-1`                          |
| `STAGING_PLAN_ROLE_ARN`   | `role_arns["staging-plan"]`          |
| `STAGING_APPLY_ROLE_ARN`  | `role_arns["staging-apply"]`         |
| `STAGING_DEPLOY_ROLE_ARN` | `role_arns["staging-deploy"]`        |

## 4. Create staging

Set `aws_account_id` and `alert_emails` in `environments/staging/staging.tfvars`, open a pull request, read the plan in the job summary, and merge. The apply job waits for your approval.

Then set the remaining variables from the staging outputs (`tofu output deploy`):

| Variable                         | Value                              |
| -------------------------------- | ---------------------------------- |
| `STAGING_ECR_REPOSITORY_URL`     | `ecr_repository_url`               |
| `STAGING_PRIVATE_SUBNETS`        | `migrate_subnets`, comma separated |
| `STAGING_MIGRATE_SECURITY_GROUP` | `migrate_security_group`           |

Every address in `alert_emails` receives an email from AWS asking to confirm the alert subscription. Alerts do nothing until it is confirmed.

## 5. Fill the application secrets

The secrets exist but are empty, and tasks will not start until they have values. Values go straight to Secrets Manager and never into the repository or the state.

```bash
# Access token signing keys. Generate locally, store, then delete the output.
pnpm --filter @rt/api keys:generate > /tmp/jwt.env
source /tmp/jwt.env
aws secretsmanager put-secret-value --secret-id rt-staging/jwt --secret-string \
  "$(jq -n --arg p "$JWT_PRIVATE_KEY_BASE64" --arg u "$JWT_PUBLIC_KEY_BASE64" --arg k "$JWT_KEY_ID" \
     '{privateKeyBase64: $p, publicKeyBase64: $u, keyId: $k}')"
rm /tmp/jwt.env

aws secretsmanager put-secret-value --secret-id rt-staging/pepper --secret-string "$(openssl rand -hex 32)"

# Empty strings turn error tracking and tracing off until the accounts exist.
aws secretsmanager put-secret-value --secret-id rt-staging/sentry --secret-string "<Sentry DSN or empty>"
aws secretsmanager put-secret-value --secret-id rt-staging/otlp --secret-string "<Authorization=Basic ... or empty>"
```

Video needs a Mux environment named staging. In the Mux dashboard, in that environment:

1. Settings, Access Tokens: create a token with Mux Video read and write. Keep the id and secret.
2. Settings, Signing Keys: create a video signing key. Mux shows the private key once, already base64 encoded.
3. Settings, Webhooks: add `https://api.staging.raisingtalents.app/v1/webhooks/mux` and copy its signing secret.

```bash
aws secretsmanager put-secret-value --secret-id rt-staging/mux --secret-string \
  "$(jq -n --arg id "<token id>" --arg secret "<token secret>" --arg hook "<webhook signing secret>" \
     --arg key "<signing key id>" --arg pem "<signing private key, as shown>" \
     '{tokenId: $id, tokenSecret: $secret, webhookSecret: $hook, signingKeyId: $key, signingPrivateKeyBase64: $pem}')"
```

The API refuses to start in staging without these values, so a missing one shows up at deploy, not when someone first uploads a video.

## 6. Email

SES starts in sandbox mode: it only delivers to addresses you have verified. For testers, verify each address in the SES console, or request production access (SES, Account dashboard, Request production access). Production access takes about a day and needs a short description of what the emails are.

DKIM, SPF and DMARC records were created in step 4. In the SES console the domain should show as verified within an hour.

## 7. First release

Run the Deploy staging workflow by hand (Actions, Deploy staging, Run workflow). It builds the image, runs migrations, rolls out the API and worker, and checks `https://api.staging.raisingtalents.app/health/ready`.

Until this first run the services have no image to start, so ECS shows them failing. That is expected.

## Check it worked

```bash
curl -i https://api.staging.raisingtalents.app/health/ready
```

Expect `200`, an `x-trace-id` header, and HSTS from the load balancer's HTTPS listener. Then sign up from a development build of the app pointed at staging (`EXPO_PUBLIC_API_URL`), and confirm the code email arrives.

## If something fails

| Symptom                                       | Likely cause                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tasks stop with `ResourceInitializationError` | A secret from step 5 has no value                                                    |
| Migrations fail with a TLS error              | The image is missing the RDS certificate bundle; rebuild from the current Dockerfile |
| `/health/ready` answers 503                   | The task cannot reach Postgres or Valkey; check security groups in the plan          |
| No verification email                         | SES sandbox: the recipient is not verified (step 6)                                  |
| Videos stay processing                        | Mux cannot reach the webhook URL, or the webhook secret in `rt-staging/mux` is wrong |
