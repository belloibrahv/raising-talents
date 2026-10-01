import type { DomainEvent, EventRecorder } from '../../../platform/domain-event.js';
import { Account } from '../domain/account.js';
import type { AccountRepository } from '../domain/account.repository.js';

export class InMemoryAccountRepository implements AccountRepository {
  readonly rows = new Map<string, ReturnType<Account['snapshot']>>();

  constructor(private readonly events: EventRecorder) {}

  async findById(id: string): Promise<Account | null> {
    const row = this.rows.get(id);
    return row ? Account.restore(row) : null;
  }

  async findByEmail(email: string): Promise<Account | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.email === email);
    return row ? Account.restore(row) : null;
  }

  async emailExists(email: string): Promise<boolean> {
    return [...this.rows.values()].some((candidate) => candidate.email === email);
  }

  async save(account: Account): Promise<void> {
    this.rows.set(account.id, account.snapshot());
    const events: DomainEvent[] = account.pullEvents();
    await this.events.record(events);
  }
}
