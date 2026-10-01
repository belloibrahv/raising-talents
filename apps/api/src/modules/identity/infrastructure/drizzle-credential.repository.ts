import { eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { credentials } from './identity.schema.js';

export class DrizzleCredentialRepository implements CredentialRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async findPasswordHash(userId: string): Promise<string | null> {
    const [row] = await this.uow
      .executor()
      .select({ passwordHash: credentials.passwordHash })
      .from(credentials)
      .where(eq(credentials.userId, userId))
      .limit(1);
    return row?.passwordHash ?? null;
  }

  async savePasswordHash(userId: string, passwordHash: string, now: Date): Promise<void> {
    await this.uow
      .executor()
      .insert(credentials)
      .values({ userId, passwordHash, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: credentials.userId, set: { passwordHash, updatedAt: now } });
  }
}
