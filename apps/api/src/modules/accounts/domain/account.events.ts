export const AccountEvents = {
  AccountCreated: 'accounts.AccountCreated',
  EmailVerified: 'accounts.EmailVerified',
  RoleSelected: 'accounts.RoleSelected',
  OnboardingCompleted: 'accounts.OnboardingCompleted',
  StaffRoleGranted: 'accounts.StaffRoleGranted',
  DeletionRequested: 'accounts.DeletionRequested',
  DeletionCancelled: 'accounts.DeletionCancelled',
  /** Recorded in the same transaction that erases the account. The payload has no personal data. */
  AccountDeleted: 'accounts.AccountDeleted',
} as const;
