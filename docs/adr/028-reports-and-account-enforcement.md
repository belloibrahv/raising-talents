# ADR-028: Reports and account enforcement

Status: Proposed. The categories, the appeal address and who may lift a ban wait for client sign-off; the flow is built.

## Context

Fake agents and scams are the main abuse on talent platforms (ADR-011), and sign-in already refuses suspended and banned accounts, but nothing could put an account in either state. Members also had no way to tell staff about a profile. Both are needed before contact requests and chat open in milestone 4.

## Decision

Members report, moderators decide:

- Anyone signed in with a verified email and an account in good standing can report a talent profile, choosing one of five categories (fake or impersonation, inappropriate content, scam or harassment, under 18, something else) and adding an optional note. Ten reports a day per person. A second open report from the same person on the same profile adds nothing, enforced by the database, and the reporter is not told either way.
- Reporters stay anonymous. The queue shows moderators the reported account, the count per category, the latest five notes and earlier suspensions or bans, never who reported.
- A moderator dismisses all of the account's open reports, suspends the account or bans it, giving a reason from the same five categories. In one transaction the reports close, the status changes, every session is revoked and the action is recorded with the moderator. A second moderator deciding at the same moment finds nothing open and changes nothing.
- Suspended and banned accounts disappear from search and public pages, cannot sign in, and get an email with the reason and an address for appeals (`SUPPORT_EMAIL`). A pending deletion is set aside, so evidence is not erased while staff are involved.
- Only an operator lifts a suspension or ban, with `pnpm --filter @rt/api account:reinstate <member email> <staff email>`. It is recorded against that staff member and the member is emailed.
- Staff accounts cannot be reported or restricted through this flow; an operator handles them.

## Alternatives considered

Automatic suspension after a number of reports: easy to abuse by a group targeting someone. Telling reporters the outcome: risks revealing private enforcement details. Suspensions that expire on a date: useful later, but every case is a judgement call for now. A reinstate button in the app: deferred until there is an appeals process to put behind it.

## Consequences

Access tokens are not checked against the account on each request, so a suspended person keeps API access for up to `ACCESS_TOKEN_TTL_SECONDS` (15 minutes); most writes already require an active account. Agent profiles cannot be reported until they have a public page. `SUPPORT_EMAIL` must be a monitored inbox before launch. Reports filed by a person are not yet in their data export (ADR-027).
