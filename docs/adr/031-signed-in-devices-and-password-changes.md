# ADR-031: Signed-in devices and password changes

Status: Accepted.

## Context

Sessions rotate on every refresh (ADR-010, ADR-024), so each sign-in starts a family of sessions. People had no way to see where they were signed in, to end a session on a lost phone, or to change their password without the reset email.

## Decision

- Each family is shown as one signed-in device, named from the User-Agent at sign-in as "browser on system" ("Chrome on Android"). Only that short label is stored: no versions and no full header, which would help fingerprinting. Refreshes carry the label forward.
- The account page lists devices with when they were last used and marks the one in use. The person can sign out any other device, or every other device at once. Signing out a device that is not theirs, or that is already signed out, answers the same as success and changes nothing, so device ids cannot be probed.
- Changing the password needs the current password, applies the sign-up rules and the breached-password check, refuses the same password, and is limited to five tries in 15 minutes. Every other device is signed out (`password_changed`) and the device in use stays signed in. The owner gets the same "password changed" email as after a reset.

## Alternatives considered

Storing IP addresses or rough locations with each session: more helpful for spotting strangers, but personal data we would have to justify and protect; the device name and time are enough for now. Signing out every device, including the current one, on a password change: safer in theory, but it punishes the person who just proved they know the password.

## Consequences

Access tokens issued before a device is signed out keep working until they expire (up to 15 minutes, as in ADR-028). Sessions started before this change show as "Unknown device" until they sign in again.
