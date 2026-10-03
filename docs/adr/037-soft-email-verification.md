# ADR-037: Soft email verification

- Status: Accepted
- Date: 2026-10-03

## Context

Until now an unverified account could do nothing except enter the 6-digit code: choosing a
role, onboarding, uploads and search all answered `EMAIL_NOT_VERIFIED`. That made email
delivery a hard dependency of every first visit. While the production SMTP provider is not
yet set up (see `docs/runbooks/railway.md`), no new account can get past the code screen.

Verification is there to protect other people, not to slow the person signing up: it stops
a mistyped or borrowed address from becoming a public profile, a target for agents, or the
basis of an agency verification.

## Decision

People can verify whenever they choose. An unverified account can:

- choose a role and finish onboarding;
- edit its profile, upload media and manage its portfolio;
- use search and shortlists, as an agent.

Anything that makes someone visible to others, or asks moderators to vouch for them, still
needs a verified email:

- **Visibility.** A talent profile is public, searchable, shortlistable, reportable and has a
  visible portfolio only when the account is active **and** the email is verified
  (`isPublic` in `get-talent-profile.queries.ts`; `documentFor` in search).
  `accounts.EmailVerified` reindexes the talent, so they appear as soon as they verify.
- **Agency verification requests** answer `EMAIL_NOT_VERIFIED`. Moderators use the address to
  check that the agent works for the agency.
- **Reports** already needed a verified email and still do.
- **Staff roles** still need one (`grantStaffRole`).

The web app no longer has a `verifyEmail` area. Instead:

- a banner on every app screen says the email is not verified, explains what that holds back
  for this role, and links to `/verify-email`. It can be hidden for the rest of the visit
  (session storage);
- the Account tab carries a red dot, announced to screen readers as "Email not verified";
- the email card on the account page shows a "Verified" or "Not verified" badge;
- `/verify-email` is open to anyone signed in, offers "Do this later", and confirms success.

## Consequences

- New accounts can explore the product even when email is down, and email outages no longer
  block sign-up.
- An unverified talent can build a full profile that nobody else can see. The banner and the
  verify screen say so plainly, so the gap is not a surprise.
- Every new place that exposes a talent to others must use `isPublic`, not `status` alone.
