import { eq } from 'drizzle-orm';
import type { EventRecorder } from '../../../platform/domain-event.js';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { Account } from '../domain/account.js';
import type { AccountRepository } from '../domain/account.repository.js';
import { users, type UserRow } from './account.schema.js';

const toDomain = (row: UserRow): Account =>
  Account.restore({
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    role: row.role,
    roleLockedAt: row.roleLockedAt,
    status: row.status,
    dateOfBirth: row.dateOfBirth,
    countryCode: row.countryCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export class DrizzleAccountRepository implements AccountRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findById(id: string): Promise<Account | null> {
    const [row] = await this.uow.executor().select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    const rows = await this.uow
      .executor()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows.length > 0;
  }

  async save(account: Account): Promise<void> {
    const props = account.snapshot();
    const row = {
      id: props.id,
      email: props.email,
      emailVerifiedAt: props.emailVerifiedAt,
      role: props.role,
      roleLockedAt: props.roleLockedAt,
      status: props.status,
      dateOfBirth: props.dateOfBirth,
      countryCode: props.countryCode,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
    await this.uow
      .executor()
      .insert(users)
      .values(row)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          emailVerifiedAt: row.emailVerifiedAt,
          role: row.role,
          roleLockedAt: row.roleLockedAt,
          status: row.status,
          updatedAt: row.updatedAt,
        },
      });
    await this.events.record(account.pullEvents());
  }
}
