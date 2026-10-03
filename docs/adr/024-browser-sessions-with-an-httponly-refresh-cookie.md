# ADR-024: Browser sessions with an HttpOnly refresh cookie

Status: Accepted.

## Context

The app keeps its refresh token in the device keychain. A browser has no equivalent that page scripts cannot reach: `localStorage` can be read by any script that ends up on the page, and a stolen refresh token keeps working for 30 days.

## Decision

The web app uses `/v1/auth/web/*`, which call the same handlers as the app's endpoints:

- The refresh token is set as a cookie: `HttpOnly` (scripts cannot read it), `Secure`, `SameSite=Strict` (other sites cannot make the browser send it) and `Path=/v1/auth/web` (no other endpoint receives it). Responses carry only the access token.
- The access token lives in memory. After a reload, the app calls `/v1/auth/web/refresh` to get a new one. Rotation and reuse detection work exactly as for the app: presenting an old cookie ends every session in that family.
- The web endpoints refuse any request whose `Origin` is not in `WEB_ORIGINS`, and CORS allows only those origins.
- Every other endpoint is unchanged and uses the bearer access token, so there is no cookie on ordinary API calls and nothing for cross-site request forgery to use.

The web app and the API live on the same site (`app.` and `api.raisingtalents.app`), which is what lets a `SameSite=Strict` cookie reach the API.

## Alternatives considered

Refresh token in `localStorage`: simplest, but readable by an injected script. A backend for the frontend that holds all tokens server-side: the strongest option, but another service to run for the MVP. Cookie sessions for every endpoint: would need CSRF tokens on every write.

## Consequences

A reload costs one refresh call before the first screen loads. The web app must stay on a subdomain of the API's site. Local development needs `WEB_COOKIE_SECURE=false` on plain http, which staging and production refuse.
