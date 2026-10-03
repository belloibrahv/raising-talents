# Architecture decision records

Each file records one decision: the context, what we chose, what we rejected and what it costs us. The same table lives in section 21 of the design document. A decision is changed by adding a new record that supersedes the old one, never by editing history.

| ADR                                                                     | Decision                                                             | Status                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------- |
| [ADR-001](001-modular-monolith-three-processes.md)                      | Modular monolith, three processes                                    | Accepted                          |
| [ADR-002](002-postgresql-as-system-of-record.md)                        | PostgreSQL as system of record                                       | Accepted                          |
| [ADR-003](003-react-native-on-expo.md)                                  | React Native on Expo                                                 | Accepted                          |
| [ADR-004](004-nestjs-on-the-fastify-adapter.md)                         | NestJS on the Fastify adapter                                        | Accepted                          |
| [ADR-005](005-drizzle-orm-with-sql-migrations.md)                       | Drizzle ORM with SQL migrations                                      | Accepted                          |
| [ADR-006](006-typesense-for-talent-search.md)                           | Typesense for talent search                                          | Accepted                          |
| [ADR-007](007-mux-for-video.md)                                         | Mux for video                                                        | Accepted                          |
| [ADR-008](008-transactional-outbox-for-domain-events.md)                | Transactional outbox for domain events                               | Accepted                          |
| [ADR-009](009-writes-over-rest-delivery-over-websocket.md)              | Writes over REST, delivery over WebSocket                            | Accepted                          |
| [ADR-010](010-in-house-authentication-module.md)                        | In-house authentication module                                       | Accepted                          |
| [ADR-011](011-only-verified-agents-can-contact-talent.md)               | Only verified agents can contact talent                              | Proposed                          |
| [ADR-012](012-adults-only-18-in-v1.md)                                  | Adults only (18+) in v1                                              | Proposed                          |
| [ADR-013](013-nigeria-as-launch-market.md)                              | Nigeria as launch market                                             | Proposed                          |
| [ADR-014](014-eas-internal-distribution-for-v1.md)                      | EAS internal distribution for v1                                     | Superseded for the MVP by ADR-023 |
| [ADR-015](015-aws-region-chosen-by-latency-test.md)                     | AWS region chosen by latency test                                    | Proposed                          |
| [ADR-016](016-pin-typescript-5.9-for-now.md)                            | Pin TypeScript 5.9 for now                                           | Accepted                          |
| [ADR-017](017-shared-endpoint-catalogue-instead-of-generated-client.md) | Shared endpoint catalogue instead of a generated client              | Accepted                          |
| [ADR-018](018-opentofu-for-infrastructure.md)                           | OpenTofu for infrastructure                                          | Accepted                          |
| [ADR-019](019-slugs-as-taxonomy-keys.md)                                | Slugs as taxonomy keys, seeded by migration                          | Accepted                          |
| [ADR-020](020-portfolio-as-one-ordered-aggregate.md)                    | Portfolio as one ordered aggregate per talent                        | Proposed                          |
| [ADR-021](021-video-through-mux-direct-uploads.md)                      | Video through Mux direct uploads, signed playback and frame scanning | Proposed                          |
| [ADR-022](022-scheduled-jobs-in-the-worker.md)                          | Scheduled jobs run in the worker under a Postgres advisory lock      | Accepted                          |
| [ADR-023](023-pwa-first-for-the-mvp.md)                                 | A progressive web app first, the native app later                    | Accepted                          |
| [ADR-024](024-browser-sessions-with-an-httponly-refresh-cookie.md)      | Browser sessions with an HttpOnly refresh cookie                     | Accepted                          |
| [ADR-025](025-talent-search-rules-and-hosting.md)                       | Talent search: who appears, who can search, and where Typesense runs | Proposed                          |
| [ADR-026](026-how-agents-are-verified.md)                               | How agents are verified                                              | Proposed                          |
| [ADR-027](027-account-deletion-and-data-export.md)                      | Account deletion and data export                                     | Proposed                          |
| [ADR-028](028-reports-and-account-enforcement.md)                       | Reports and account enforcement                                      | Proposed                          |
| [ADR-029](029-shadcn-ui-on-tailwind-for-the-web-app.md)                 | shadcn/ui on Tailwind CSS for the web app                            | Accepted                          |
| [ADR-030](030-agent-shortlists.md)                                      | Agent shortlists                                                     | Proposed                          |
| [ADR-031](031-signed-in-devices-and-password-changes.md)                | Signed-in devices and password changes                               | Accepted                          |
| [ADR-032](032-in-app-notification-inbox.md)                             | An in-app notification inbox                                         | Accepted                          |
| [ADR-033](033-lighthouse-budget-for-the-pwa.md)                         | A Lighthouse budget for the PWA                                      | Accepted                          |
| [ADR-034](034-changing-the-email-address.md)                            | Changing the email address                                           | Accepted                          |
| [ADR-035](035-web-error-reporting-and-recovery.md)                      | Error reporting and recovery in the web app                          | Accepted                          |
| [ADR-036](036-hosting-on-railway.md)                                    | Hosting on Railway                                                   | Accepted                          |
| [ADR-037](037-soft-email-verification.md)                               | Soft email verification                                              | Accepted                          |
| [ADR-038](038-contact-requests-and-chat.md)                             | Contact requests and chat                                            | Accepted                          |
| [ADR-039](039-reporting-from-a-conversation.md)                         | Reporting from a conversation                                        | Accepted                          |
