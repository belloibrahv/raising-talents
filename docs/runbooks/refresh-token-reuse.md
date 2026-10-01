# Runbook: refresh token reuse detected

## What it means

A refresh token that had already been used was presented again. That happens when a token is stolen and replayed, or, rarely, when the app sends two refreshes at once. The API revoked every session in that sign-in family and recorded `identity.SessionFamilyRevoked` with reason `reuse_detected`.

## When to act

One event for a user is normal noise (for example a phone that lost signal mid-refresh). Investigate when:

- the same user triggers it more than twice in a day, or
- the rate across all users rises above its usual baseline in Grafana.

## Investigate

```sql
select user_id, device_id, family_id, revoked_reason, created_at, revoked_at
from identity.sessions
where revoked_reason in ('reuse_detected', 'device_mismatch')
order by revoked_at desc
limit 100;
```

A `device_mismatch` next to the reuse means the token was used from a different install, which points to theft rather than a network retry. Escalate to the security owner and consider suspending the account until the person confirms their identity.

## If the app is the cause

A spike right after a release usually means the app sent parallel refreshes. The mobile client must refresh through a single shared promise. Roll back the build with an EAS Update and fix the client.
