export const IdentityEvents = {
  /** Handled in the worker: creates a code and emails it. The code never enters the outbox. */
  EmailVerificationRequested: 'identity.EmailVerificationRequested',
  SessionFamilyRevoked: 'identity.SessionFamilyRevoked',
  /** Handled in the worker: creates a reset code and emails it. */
  PasswordResetRequested: 'identity.PasswordResetRequested',
  /** Handled in the worker: tells the owner, in case it was not them. */
  PasswordChanged: 'identity.PasswordChanged',
  /** Handled in the worker: sends the code to the new address and warns the old one. */
  EmailChangeRequested: 'identity.EmailChangeRequested',
} as const;
