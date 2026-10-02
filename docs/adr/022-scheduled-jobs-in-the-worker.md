# ADR-022: Scheduled jobs run in the worker under a Postgres advisory lock

Status: Accepted.

## Context

Some work runs on a clock rather than on an event, starting with closing abandoned uploads. Staging and production run more than one worker task, and a job such as cleanup must not run twice at once.

## Decision

The worker starts a `JobScheduler` beside the outbox relay. Each job has a name and an interval. Before a run, the scheduler takes a session advisory lock named after the job on one pooled Postgres connection; a worker that cannot take it skips that run. A run never overlaps itself in one process, and shutdown waits for runs in progress.

Every job must be safe to repeat: it works from what the database says now, not from what the last run did.

## Alternatives considered

EventBridge Scheduler calling an internal endpoint or a one-off ECS task: more infrastructure for a job that takes seconds. A cron library with Redis locks: another moving part, when Postgres already gives us locks that end with the connection.

## Consequences

No infrastructure change. A crashed worker loses its lock with its connection. Timing is approximate (each worker counts from its own start), which suits cleanup work. A job that must run at a fixed time of day will need something else.
