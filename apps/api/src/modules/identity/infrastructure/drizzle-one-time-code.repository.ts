import { and, desc, eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { OneTimeCode, type OneTimeCodePurpose } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { oneTimeCodes } from './identity.schema.js';

export class DrizzleOneTimeCodeRepository implements OneTimeCodeRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async findLatest(userId: string, purpose: OneTimeCodePurpose): Promise<OneTimeCode | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(oneTimeCodes)
      .where(and(eq(oneTimeCodes.userId, userId), eq(oneTimeCodes.purpose, purpose)))
      .orderBy(desc(oneTimeCodes.createdAt))
      .limit(1);
    return row ? OneTimeCode.restore(row) : null;
  }

  async save(code: OneTimeCode): Promise<void> {
    const props = code.snapshot();
    await this.uow
      .executor()
      .insert(oneTimeCodes)
      .values(props)
      .onConflictDoUpdate({
        target: oneTimeCodes.id,
        set: { attempts: props.attempts, consumedAt: props.consumedAt },
      });
  }
}
