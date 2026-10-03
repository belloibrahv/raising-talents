# Runbook: reports, suspensions and bans

Moderators handle reports in the app, under Moderation, Reports (ADR-028). This runbook covers what the app does not.

## Deciding a report

- Dismiss when the profile breaks no guideline. The reporter is not told.
- Suspend for a first or unclear breach. The person is signed out, hidden and emailed the reason with the appeal address.
- Ban for scams, impersonation, anyone who seems under 18, or repeated harm after a suspension. "Suspended or banned before" on the card shows the history.

Never contact the reporter about the outcome, and never tell the reported person who reported them.

## An appeal arrives at the support inbox

A different moderator from the one who decided reads the appeal. To see who decided and why:

```sql
select action, reason, created_at, actor_id
from safety.enforcement_actions
where account_id = (select id from accounts.users where email = '<member email>')
order by created_at;
```

If the appeal succeeds, lift the restriction:

```sh
pnpm --filter @rt/api account:reinstate <member email> <your staff email>
```

The member is emailed, appears in search again within a minute, and can sign in. Reply to the appeal either way.

## Someone is in danger or a child is involved

Ban first, then follow the escalation contacts the client keeps for law enforcement. Do not delete anything: the account, its files and the reports are the evidence. A banned account's pending deletion is cancelled automatically.

## A staff account needs restricting

Moderators cannot do this in the app. An operator changes the role or status directly and records why in the ticket.
