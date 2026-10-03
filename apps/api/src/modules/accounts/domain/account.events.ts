export const AccountEvents = {
  AccountCreated: 'accounts.AccountCreated',
  EmailVerified: 'accounts.EmailVerified',
  /** No payload: the addresses are personal data and stay out of the outbox. */
  EmailChanged: 'accounts.EmailChanged',
  RoleSelected: 'accounts.RoleSelected',
  OnboardingCompleted: 'accounts.OnboardingCompleted',
  StaffRoleGranted: 'accounts.StaffRoleGranted',
  DeletionRequested: 'accounts.DeletionRequested',
  DeletionCancelled: 'accounts.DeletionCancelled',
  /** Payload: the reason category, so the email can say why. */
  AccountSuspended: 'accounts.AccountSuspended',
  AccountBanned: 'accounts.AccountBanned',
  AccountReinstated: 'accounts.AccountReinstated',
  /** Recorded in the same transaction that erases the account. The payload has no personal data. */
  AccountDeleted: 'accounts.AccountDeleted',
} as const;
