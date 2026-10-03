import { and, asc, count, desc, eq, gt, or } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  PendingVerificationExistsError,
  VerificationRequest,
  type VerificationRequestRepository,
} from '../domain/verification-request.js';
import { verificationRequests } from './agent-profile.schema.js';

const isPendingClash = (error: unknown): boolean => {
  const cause =
    (error as { cause?: { code?: string; constraint?: string } }).cause ??
    (error as { code?: string; constraint?: string });
  return cause.code === '23505' && cause.constraint === 'verification_requests_one_pending';
};

export class DrizzleVerificationRequestRepository implements VerificationRequestRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findById(
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<VerificationRequest | null> {
    const query = this.uow
      .executor()
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.id, id))
      .limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? VerificationRequest.restore(row) : null;
  }

  async findLatestForAgent(agentId: string): Promise<VerificationRequest | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(verificationRequests)
      .where(eq(verificationRequests.agentId, agentId))
      .orderBy(desc(verificationRequests.submittedAt))
      .limit(1);
    return row ? VerificationRequest.restore(row) : null;
  }

  async countDeclined(agentId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(verificationRequests)
      .where(
        and(eq(verificationRequests.agentId, agentId), eq(verificationRequests.status, 'declined')),
      );
    return row?.total ?? 0;
  }

  async findPending(
    after: { submittedAt: Date; id: string } | null,
    limit: number,
  ): Promise<VerificationRequest[]> {
    const pending = eq(verificationRequests.status, 'pending');
    const rows = await this.uow
      .executor()
      .select()
      .from(verificationRequests)
      .where(
        after
          ? and(
              pending,
              or(
                gt(verificationRequests.submittedAt, after.submittedAt),
                and(
                  eq(verificationRequests.submittedAt, after.submittedAt),
                  gt(verificationRequests.id, after.id),
                ),
              ),
            )
          : pending,
      )
      .orderBy(asc(verificationRequests.submittedAt), asc(verificationRequests.id))
      .limit(limit);
    return rows.map((row) => VerificationRequest.restore(row));
  }

  async save(request: VerificationRequest): Promise<void> {
    const row = request.snapshot();
    try {
      await this.uow
        .executor()
        .insert(verificationRequests)
        .values(row)
        .onConflictDoUpdate({
          target: verificationRequests.id,
          set: {
            status: row.status,
            decidedBy: row.decidedBy,
            decidedAt: row.decidedAt,
            declineCategory: row.declineCategory,
          },
        });
    } catch (error) {
      if (isPendingClash(error)) throw new PendingVerificationExistsError();
      throw error;
    }
    await this.events.record(request.pullEvents());
  }
}
