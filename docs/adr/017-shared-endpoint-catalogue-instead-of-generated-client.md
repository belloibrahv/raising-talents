# ADR-017: Shared endpoint catalogue instead of a generated client

Status: Accepted. Supersedes the Orval client planned in sections 8 and 9 of the design document.

## Context

The design planned to generate an OpenAPI document from the API and then generate the app's client from that document with Orval. The API and the app are both TypeScript and already share the Zod schemas in `@rt/contracts`. Going from Zod to OpenAPI and back to TypeScript loses detail (normalising transforms, custom messages, refinements) and adds generated code that every pull request has to review.

## Decision

`@rt/contracts` holds an endpoint catalogue: for each route, its method, path, whether it needs a token, the request and response schemas, the success status and the business errors it can return.

- The app calls endpoints by name through `api.call`, typed and validated from the catalogue. No code generation.
- An API test reads every route NestJS registers and fails if any route, method or success status differs from the catalogue.
- `openapi.json` is generated from the catalogue at build time and committed. CI fails if it is out of date. It serves documentation, testing tools and any future client that is not written in TypeScript.

## Alternatives considered

Orval or openapi-typescript generating the client from the OpenAPI document. NestJS Swagger decorators on controllers.

## Consequences

One list to update per new endpoint, and three checks that fail when it is not updated. If a non-TypeScript client appears later, Orval or any other generator can still run against `openapi.json`.
