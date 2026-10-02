export const IdentityEvents = {
  /** Handled in the worker: creates a code and emails it. The code never enters the outbox. */
  EmailVerificationRequested: 'identity.EmailVerificationRequested',
  SessionFamilyRevoked: 'identity.SessionFamilyRevoked',
  /** Handled in the worker: creates a reset code and emails it. */
  PasswordResetRequested: 'identity.PasswordResetRequested',
  /** Handled in the worker: tells the owner, in case it was not them. */
  PasswordChanged: 'identity.PasswordChanged',
} as const;
