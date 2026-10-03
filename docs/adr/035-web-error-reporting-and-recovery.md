# ADR-035: Error reporting and recovery in the web app

Status: Accepted.

## Context

The PWA became the product (ADR-023), but only the parked native app reported errors. A screen that threw while rendering showed React Router's developer page, and a tab left open across a release failed when it tried to load a screen's code that the release had replaced. Nobody would have heard about either.

## Decision

- The web app reports to Sentry when the build sets `VITE_SENTRY_DSN`, with the same rules as the native app: no personal data by default, request bodies, cookies and headers removed, errors only (no tracing, no session replay). The SDK loads after start-up and only when reporting is on, so it costs the first screen nothing.
- What is reported is decided in one place (`should-report.ts`): server failures (5xx) with the API's trace id, and anything unexpected. Expected outcomes are not: 4xx answers, lost signal, and stale code after a release. Failed queries and mutations go through it from the query client, and route errors from the error screen.
- The Content Security Policy allows the tracker's ingest origin only when `error_reporting_origin` is set (empty by default), so reporting cannot be switched on by the build alone.
- Every screen has an error boundary. Signed-in screens fail inside the layout, so the header and tabs stay. The message fits the cause: a new version ready (reload), offline (try again when connected), or something went wrong (try again, or go to the start).
- Signed-in screens show a skeleton of the page while their data or code loads, inside the layout, instead of a full-screen spinner. The start-up check keeps the spinner, since no layout exists yet.
- With reduced motion requested, animations run once; a looping skeleton would otherwise flicker.

## Alternatives considered

Loading the SDK in the main bundle: simpler, but about 25 KB more on every first visit for something most visits never use. A self-hosted error collector: more control over data, but another service to run before launch.

## Consequences

Turning reporting on for an environment needs a Sentry project, the DSN as a repository variable and the ingest origin in Terraform (see the staging runbook).
