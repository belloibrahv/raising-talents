# System design document

The full design lives in the shared document "Raising Talents: System Design Document":
https://claude.ai/code/artifact/b7294fc1-4976-44ad-8bbb-e7434856feb4

Read it before you change code. A short reading order for new developers:

1. Section 2 for scope and the locked decisions.
2. Section 5 for how a backend module is laid out (domain, application, infrastructure, interface).
3. Section 6 for the workflow you are about to touch, and its rules.
4. Section 8 for API standards: error codes, pagination, idempotency, versioning.
5. Section 19 for how we work, including the writing standards that CI enforces.

Decisions are also kept in the repository as files under [docs/adr](adr/README.md).
If the code and the document disagree, raise it in the pull request. One of them is wrong and must be fixed in the same change.
