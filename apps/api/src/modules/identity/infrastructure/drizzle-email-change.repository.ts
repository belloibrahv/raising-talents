import { eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EmailChange, EmailChangeRepository } from '../domain/email-change.js';
import { emailChanges } from './identity.schema.js';

export class DrizzleEmailChangeRepository implements EmailChangeRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async find(userId: string): Promise<EmailChange | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(emailChanges)
      .where(eq(emailChanges.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async save(change: EmailChange): Promise<void> {
    await this.uow
      .executor()
      .insert(emailChanges)
      .values(change)
      .onConflictDoUpdate({
        target: emailChanges.userId,
        set: {
          newEmail: change.newEmail,
          previousEmail: change.previousEmail,
          requestedAt: change.requestedAt,
          confirmedAt: change.confirmedAt,
        },
      });
  }

  async remove(userId: string): Promise<void> {
    await this.uow.executor().delete(emailChanges).where(eq(emailChanges.userId, userId));
  }
}
