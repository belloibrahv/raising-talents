# ADR-044: Finishing onboarding while a photo is checked

- Status: Accepted
- Date: 2026-10-06

## Context

A talent profile is complete, and the account leaves onboarding, only once the profile photo
is approved. On Railway every photo is held for a moderator (`CONTENT_SCANNER=manual-review`,
ADR-036). A new talent who uploaded a photo was therefore stuck on the photo step:

- Home sent them back to it, and Portfolio and Messages were not offered;
- this lasted until a moderator happened to act, which could take hours or days.

Live testing confirmed it: the upload worked and the photo went to `held_for_review`, and the
account stayed in `onboarding`.

## Decision

- **Leaving onboarding.** A talent leaves onboarding when every step is done and a photo has
  been sent. Either an approved photo or one waiting for a moderator
  (`pendingAvatarMediaId`) counts.
- **Who does it.** The worker handles `media.MediaHeldForReview` for avatars, records the
  waiting photo and finishes onboarding. Saving the last step after the photo was sent
  finishes it too.
- **Visibility is unchanged.** Being visible to agents (search, profile, shared page,
  contact) still needs `isComplete`, which needs an approved photo. Moderation still protects
  agents. It just no longer blocks the talent from using the app.
- **A rejected photo** clears the waiting photo. The talent stays in the app, and Home asks
  for a new photo. Onboarding never goes backwards.
- **Screens.**
  - **The photo step:** when the photo is held, it says "Your photo is with a moderator"
    and offers "Continue to Raising Talents". That waits up to 10 seconds for the worker to
    finish onboarding, then opens Home.
  - **Home:** shows "Your photo is with a moderator" while it waits, and "Add a profile
    photo" if the last one was turned down.
- **Backfill.** The migration applies the same rule to talent who were already stuck: it
  records their latest held avatar and activates those whose other steps are done.

## Consequences

- Talent can build a portfolio and set up their public link while their photo waits. All of
  it becomes visible to agents the moment a photo is approved.
- Counting "onboarded" and "visible" separately is now needed in any future reporting: an
  active talent is not necessarily visible.
