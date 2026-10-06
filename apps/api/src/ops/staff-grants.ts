import type { Logger } from 'pino';
import type { AccountsFacade } from '../modules/accounts/application/accounts.facade.js';
import type { UnitOfWork } from '../platform/unit-of-work.js';

export interface StaffGrant {
  readonly email: string;
  readonly role: 'moderator' | 'admin';
}

/**
 * Reads STAFF_GRANT: "email=role", several separated by commas. Railway images have no shell,
 * so operators cannot run `staff:grant` there; setting this on the worker does the same on its
 * next start (docs/runbooks/railway.md). Anything malformed is ignored and reported.
 */
export function parseStaffGrants(value: string | undefined): {
  grants: StaffGrant[];
  rejected: string[];
} {
  const grants: StaffGrant[] = [];
  const rejected: string[] = [];
  for (const entry of (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const [email, role] = entry.split('=').map((part) => part.trim().toLowerCase());
    if (email?.includes('@') && (role === 'moderator' || role === 'admin')) {
      grants.push({ email, role });
    } else {
      rejected.push(entry);
    }
  }
  return { grants, rejected };
}

/** Applies each grant on its own. Repeating one changes nothing. */
export async function applyStaffGrants(
  value: string | undefined,
  accounts: AccountsFacade,
  uow: UnitOfWork,
  logger: Logger,
): Promise<void> {
  const { grants, rejected } = parseStaffGrants(value);
  if (rejected.length > 0)
    logger.error({ rejected }, 'STAFF_GRANT entries ignored: use email=role');
  for (const grant of grants) {
    const result = await uow.run(() => accounts.grantStaffRole(grant.email, grant.role));
    if (result.ok) logger.warn({ userId: result.value, role: grant.role }, 'staff role granted');
    else
      logger.error({ email: grant.email, reason: result.error.message }, 'staff role not granted');
  }
}
