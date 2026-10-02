# ADR-026: How agents are verified

Status: Proposed. The evidence and reasons below wait for client sign-off; the flow is built.

## Context

ADR-011 lets only verified agents contact talent, and the profile shows a verified badge. Something has to decide who is verified, and fake agents are the main abuse on talent platforms, so the check is done by a person, not automatically.

## Decision

An agent with a complete profile and an active account asks to be verified. They send:

- one https link to a page that shows they work for the agency (its team page, or its official social page naming them). Required.
- the agency's CAC number as printed (RC, BN or IT followed by digits). Optional, because small independent scouts may not be registered.
- a short note. Optional.

A moderator sees the request next to the agency profile, the account's email (a matching domain is a good sign) and how many earlier requests were declined. They verify, or decline with one of four reasons, each with a fixed sentence the agent reads: could not confirm they work there; details do not match; the evidence would not open; other.

Rules: one pending request per agent, enforced by the database; three requests a day; a declined agent can ask again at once with new evidence; renaming the agency removes the badge (design section 6.12) until a new request is approved. Every request is kept with who decided and when.

## Alternatives considered

Automatic checks against the CAC register: no public API for this at launch. Document uploads (ID cards, certificates): more convincing, but means storing sensitive documents, which needs a retention policy and more security work first. Paid verification: puts off the small scouts the platform wants.

## Consequences

Moderators need the agency's public pages to be reachable, and a few minutes per request. Agents learn the outcome in the app; emailing them waits for a notifications module that every part of the API can use. If abuse appears, document uploads can be added as a second, stronger level.
