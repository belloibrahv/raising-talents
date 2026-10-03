import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  PendingVerificationExistsError,
  VerificationRequest,
  type VerificationRequestRepository,
} from '../domain/verification-request.js';

export class InMemoryVerificationRequestRepository implements VerificationRequestRepository {
  readonly rows = new Map<string, ReturnType<VerificationRequest['snapshot']>>();

  constructor(private readonly events: EventRecorder) {}

  async findById(id: string): Promise<VerificationRequest | null> {
    const row = this.rows.get(id);
    return row ? VerificationRequest.restore(row) : null;
  }

  async findLatestForAgent(agentId: string): Promise<VerificationRequest | null> {
    const latest = [...this.rows.values()]
      .filter((row) => row.agentId === agentId)
      .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
    return latest ? VerificationRequest.restore(latest) : null;
  }

  async countDeclined(agentId: string): Promise<number> {
    return [...this.rows.values()].filter(
      (row) => row.agentId === agentId && row.status === 'declined',
    ).length;
  }

  async findPending(
    after: { submittedAt: Date; id: string } | null,
    limit: number,
  ): Promise<VerificationRequest[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === 'pending')
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime() || a.id.localeCompare(b.id))
      .filter(
        (row) =>
          after === null ||
          row.submittedAt > after.submittedAt ||
          (row.submittedAt.getTime() === after.submittedAt.getTime() && row.id > after.id),
      )
      .slice(0, limit)
      .map((row) => VerificationRequest.restore(row));
  }

  async save(request: VerificationRequest): Promise<void> {
    const row = request.snapshot();
    const clash = [...this.rows.values()].some(
      (other) =>
        other.id !== row.id &&
        other.agentId === row.agentId &&
        other.status === 'pending' &&
        row.status === 'pending',
    );
    if (clash) throw new PendingVerificationExistsError();
    this.rows.set(row.id, row);
    await this.events.record(request.pullEvents());
  }
}
