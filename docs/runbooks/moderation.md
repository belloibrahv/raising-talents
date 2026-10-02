# Moderation: staff accounts and the held media queue

## Make someone a moderator

Staff use their own account, never a talent or agent account.

1. They sign up in the app with their work email and enter the emailed code. They stop at "How will you use Raising Talents?" and do not choose a role.
2. An engineer with database access runs, against the right environment:

```bash
pnpm --filter @rt/api staff:grant moderator.name@raisingtalents.app moderator
```

Use `admin` instead of `moderator` only for people who will manage other staff. The command refuses a talent or agent account that has finished setting up, and logs who was granted what.

3. They sign out and in again. The app opens on the moderation queue.

## Work the queue

The scanner holds files it is unsure about (design section 10, ADR-007 for video). A held profile photo blocks the talent from finishing their profile, so the queue should be cleared every working day.

- Approve: the file goes live. A held profile photo becomes the avatar and the profile completes, as if the scan had passed.
- Reject: choose the closest reason. The owner sees a fixed sentence for it, never the scanner's labels, and the files are deleted.

Every decision is recorded on the file (who and when) and in the API log as `held media reviewed`.

## If something is wrong

| Symptom                                                | Likely cause                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| A moderator gets "Only moderators can do this."        | The grant ran against another environment, or they did not sign in again |
| An approved photo is not on the profile after a minute | The worker is down or behind; see outbox-dead-letter.md                  |
| The queue keeps growing                                | Scan thresholds may be too strict: `SCAN_REVIEW_AT` (default 50)         |

To try the queue locally, set `CONTENT_SCANNER=development-hold-all` in `apps/api/.env`: every image is held.
