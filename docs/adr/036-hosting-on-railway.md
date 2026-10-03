# ADR-036: Hosting on Railway

Status: Accepted. The AWS design (ADR-018, ADR-023) stays the target for scale; Railway runs the app now.

## Context

The client chose Railway to put the app in front of people before an AWS account exists. Railway runs containers, managed Postgres and Redis, and private S3-compatible buckets, but has no Rekognition, no CDN in front of a bucket, and gives every service its own `*.up.railway.app` address, which browsers treat as a separate site.

## Decision

- **Services.** `web`, `api` and `worker` build from the repository (`apps/web/Dockerfile.railway`, `apps/api/Dockerfile.railway`). `APP_ROLE` picks the process in the API image, since Railway starts containers without a shell; the API applies migrations at start (`MIGRATE_ON_START`) under a Postgres advisory lock. Postgres, Redis and Typesense (with a volume) run as Railway services; media lives in a Railway bucket.
- **One origin.** Only `web` is public. Its server (the same script that imitates CloudFront for tests, so CSP, routes and caching match AWS) passes `/v1` and `/media` to the API over the private network (`API_UPSTREAM`). The app and its API therefore share an origin, so the session cookie stays first-party (ADR-024) and no CORS is involved. The proxy forwards only the client address Railway's edge added, so the API can trust it for rate limits.
- **Media.** The bucket is private, so the API serves processed variants itself (`MEDIA_DELIVERY=api`): only `media/{owner}/{id}/{256,1024,2048}.webp`, immutable for a year. Browsers still upload straight to the bucket with presigned POSTs; the bucket's CORS allows the app's origin.
- **Production rules, adjusted narrowly.** Plain database and Redis connections are allowed only to hosts on Railway's encrypted private network (`*.railway.internal`); anywhere else TLS is still required. `CONTENT_SCANNER=manual-review` holds every image for a moderator, with an honest label; the development scanners stay refused. Video may be off (`VIDEO_PROVIDER=disabled`): uploads are refused, nothing is left unprocessed.
- **Email** goes through the client's SMTP provider.

## Alternatives considered

Separate public addresses for the app and the API: simpler, but the refresh cookie becomes third-party and Safari blocks it. A custom domain would fix that and can replace the proxy later. Automatic image scanning through Rekognition from Railway: possible with AWS keys, but the client chose review by people until AWS exists.

## Consequences

Every photo waits for a moderator, so someone must watch the queue daily. Video is off until a Mux account exists. Moving to AWS later is configuration: the AWS Dockerfile, CDN delivery and Rekognition remain in place.
