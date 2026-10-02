import type { AccountStatus, Role } from '@rt/contracts';

/** Moderators and admins with an active account: the only people who may use staff tools. */
export function isActiveStaff(
  account: { role: Role | null; status: AccountStatus } | null,
): boolean {
  return (
    (account?.role === 'moderator' || account?.role === 'admin') && account.status === 'active'
  );
}
