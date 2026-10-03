# ADR-033: A Lighthouse budget for the PWA

Status: Accepted. Whether public pages should be indexed by search engines waits for the client; until then they are not.

## Context

The PWA (ADR-023) is used mostly on mid-range Android phones over mobile data, so how fast it starts and how well it works with assistive technology decide whether people stay. Nothing measured either, and a first run of Lighthouse on the welcome screen scored 71 for performance and logged an error on every first visit.

## Decision

- CI runs Lighthouse three times on the welcome, sign-in and sign-up screens on a throttled phone, and fails the build below these lines: accessibility 100, best practices 100, performance 85 (median run), cumulative layout shift under 0.1, total blocking time under 200 ms, plus a title and a meta description. Reports are kept as a build artifact for 14 days, never uploaded to a public service.
- The build is served by `apps/web/scripts/serve-like-cloudfront.mjs`, which reads the routing function and the Content Security Policy from the hosting module and compresses and caches exactly as CloudFront does, so the measurement matches production. In CI a stub answers the start-up session check the way the API answers a visitor.
- A visitor with no session cookie now gets 204 from the session check rather than a 401, so first visits log nothing. A cookie that is present but expired, revoked or reused still gets 401.
- The page opens its connection to the API while the app downloads (`preconnect`).
- `robots.txt` keeps search engines out while every useful page is behind sign-in, so the SEO category is not scored; its title and description checks are.

## Alternatives considered

Measuring the deployed staging site: closer to real, but it needs an AWS account and makes every pull request wait on a deploy. Scoring every screen: signed-in screens need test accounts in CI; the public screens carry the first impression and the shared bundle, so they catch most regressions.

## Consequences

A change that slows the start or breaks accessibility fails CI with a report showing why. The budget is tightened as the app improves. Results after this change: performance 92 to 93, accessibility 100, best practices 100.
