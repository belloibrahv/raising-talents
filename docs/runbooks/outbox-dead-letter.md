# Runbook: outbox event dead-lettered

## What fired

The worker logged `Outbox event dead-lettered after maximum attempts` with `alert: true`. An event failed 10 times over roughly 30 minutes and will not be retried on its own.

## Impact

Whatever reacts to that event did not happen. For `identity.EmailVerificationRequested` a person did not get their verification code. They can still ask for a new code from the app after 60 seconds.

## Find the event

```sql
select id, event_type, aggregate_id, attempts, last_error, occurred_at
from platform.outbox
where published_at is null and attempts >= 10
order by occurred_at desc;
```

`last_error` usually names the cause: an email provider outage, a bad credential after a secret rotation, or a bug in a handler.

## Fix and replay

1. Fix the cause first. Replaying into the same failure only fills the logs.
2. Replay the event. Handlers are idempotent, so a replay is safe:

```sql
update platform.outbox
set attempts = 0, next_attempt_at = now(), last_error = null
where id = '<event id>';
```

3. Watch the worker logs for the event id and confirm `published_at` is set.

## If many events are stuck

Check provider status pages (SES, Mux, Expo Push) and the worker's error rate in Grafana before replaying. Replay in batches of a few hundred so the provider is not flooded.
