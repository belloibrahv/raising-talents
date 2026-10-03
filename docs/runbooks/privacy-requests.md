# Runbook: privacy requests

People export their data and delete their account themselves from the account page (ADR-027). This runbook covers the cases that reach support instead.

## Someone cannot sign in and wants their data or their account gone

Confirm they control the email address first: ask them to start a password reset and read back nothing but whether the code arrived. Once they are back in, the account page does the rest. Never send an export by email.

## A suspended or banned person asks for deletion

They cannot request it themselves. Check with the moderation lead whether the account is part of an open case. If not, schedule it:

```sql
update accounts.users
set status = 'pending_deletion', deletion_scheduled_at = now()
where id = '<user id>' and status in ('suspended', 'banned');
```

The hourly erasure job removes it within the hour. Record the request and the date in the support ticket.

## Check that an erasure happened

```sql
select occurred_at, published_at
from platform.outbox
where event_type = 'accounts.AccountDeleted' and aggregate_id = '<user id>';
```

A row with `published_at` set means the account is gone and search has been told. The worker log line `account erased` gives the number of files removed. Database backups keep the data for 7 days on staging; tell the person when they ask.

## Erasure seems stuck

Accounts past their date that still exist:

```sql
select id, deletion_scheduled_at from accounts.users
where status = 'pending_deletion' and deletion_scheduled_at < now() - interval '2 hours';
```

Look for `privacy.account-erasure` errors in the worker logs. A storage or Mux outage stops the job before the database row is touched, so the next run retries safely.
