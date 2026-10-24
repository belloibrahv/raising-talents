# ADR-060: Agency evidence without a CAC number

- Status: Accepted
- Date: 2026-10-24
- Changes: ADR-026 (what an agent sends to be verified)

## Context

ADR-026 asked agents for a CAC number, optionally, next to a link that shows they work for
the agency. The CAC register is Nigerian, and agencies on Raising Talents are not only in
Nigeria, so the field confused agents from elsewhere (issue #70). The link and the website
also had to start with `https://`, and agents typed `www.` and were refused.

## Decision

- **No CAC number.** The verification form asks for the link and an optional note. The API
  refuses a `registrationNumber` field like any other unknown field. Requests made before
  this keep theirs, and the moderator's card shows it only when there is one.
- **Web addresses as people type them.** The evidence link and the agency website take
  `www.agency.com`, `agency.com/team` or a full `https://` address, and are stored with
  `https://` in front. One rule in the contracts (`webAddressSchema`) is used by the API and
  the app. An `http://` address is still refused: moderators open these links, and talent
  open the website from the agent's page.

## Consequences

- Moderators lose a signal for Nigerian agencies that had one. The link, the email domain
  and the earlier declines remain, and a moderator can still ask for a number in the note.
- An address that is only a word, such as `eko`, is refused: the rule needs a domain.
