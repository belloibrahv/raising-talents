# ADR-023: A progressive web app first, the native app later

Status: Accepted. Supersedes the delivery plan in ADR-014 for the MVP; ADR-003 still holds for the native app.

## Context

The client wants the MVP in people's hands quickly. A native app needs store review, EAS builds and testers who install a build, and every fix waits for a new build. A web app is one link, updates on the next visit, and works on any phone or laptop.

## Decision

The MVP ships as a progressive web app in `apps/web`:

- Vite, React and TypeScript, built to static files and served from S3 and CloudFront. No server rendering: every screen sits behind sign-in, so it would add a server to run without helping search.
- React Router for screens and TanStack Query for server state, as in the Expo app.
- A Workbox service worker precaches the app shell, so it opens instantly and offline, and shows an update prompt when a new version is live. API responses are never cached: they are personal. Ready images from the media CDN are cached with a size and age limit.
- A web app manifest with maskable icons, so it installs to the home screen on Android, iOS and desktop.
- Accessibility to WCAG 2.2 AA: semantic HTML, labelled controls, visible focus, focus moved to each new screen's heading, and reduced motion respected.
- It talks to the API through the shared endpoint catalogue in `@rt/contracts` (ADR-017).

`apps/mobile` is parked as it is: it still builds and its tests still run. When native work resumes, the parts both apps need (the HTTP client and the error messages) move into a shared package.

## Alternatives considered

Expo for web from the same codebase: one codebase, but React Native Web renders `div`s instead of forms and buttons, so accessibility and the service worker need more work, and the bundle is heavier. Next.js: server rendering and a Node server to run, with no screen that needs it.

## Consequences

Two front ends to keep in step once native work resumes. iOS installs from Safari's share sheet rather than a prompt, and web push on iOS needs the app installed first. Camera access for uploads uses the file picker's capture option, which covers what the MVP needs.
