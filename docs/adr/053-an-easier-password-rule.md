# ADR-053: An easier password rule

- Status: Accepted
- Date: 2026-10-12
- Changes: ADR-010 (password rules)

## Context

New members were being turned away at sign-up. A password needed ten characters, four
different characters, could not contain the start of the email address, and was refused if
it had ever appeared in any data breach. Most passwords people really use have leaked at
least once somewhere, so ordinary people met "choose a stronger password" several times in a
row. The client asked for sign-up to be easy.

## Decision

- **Eight characters or more** (up to 128). No other rule about what is in it.
- **Only very common passwords are refused.** The breach lookup stays (Have I Been Pwned,
  by hash prefix, so the password never leaves us), but a password is refused only when it
  has been seen 10,000 times or more. That stops "password", "12345678" and the like, which
  are what attackers try first, and lets the rest through.
- The message says why: "This is one of the most common passwords, so it is easy to guess."

## What still protects accounts

Argon2 hashing, sign-in limits per email and per address, signed-in devices that can be
signed out, a notice when the password changes, and email codes for resets.

## Consequences

- Weaker passwords are accepted than before. The sign-in limits make guessing slow, and the
  most guessable ones are still refused.
- Existing passwords are untouched.
- `BREACHED_PASSWORD_CHECK=false` still turns the lookup off entirely.
