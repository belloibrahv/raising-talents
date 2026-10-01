export const IdentityEvents = {
  /** Handled in the worker: creates a code and emails it. The code never enters the outbox. */
  EmailVerificationRequested: 'identity.EmailVerificationRequested',
  SessionFamilyRevoked: 'identity.SessionFamilyRevoked',
} as const;
