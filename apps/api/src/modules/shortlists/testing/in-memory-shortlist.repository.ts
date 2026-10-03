import type { ShortlistEntry, ShortlistRepository } from '../domain/shortlist.js';

export class InMemoryShortlistRepository implements ShortlistRepository {
  readonly rows = new Map<string, ShortlistEntry>();
  private key = (agentId: string, talentId: string) => `${agentId}|${talentId}`;

  find(agentId: string, talentId: string): Promise<ShortlistEntry | null> {
    return Promise.resolve(this.rows.get(this.key(agentId, talentId)) ?? null);
  }

  save(entry: ShortlistEntry): Promise<ShortlistEntry> {
    const existing = this.rows.get(this.key(entry.agentId, entry.talentId));
    const saved = { ...entry, savedAt: existing?.savedAt ?? entry.savedAt };
    this.rows.set(this.key(entry.agentId, entry.talentId), saved);
    return Promise.resolve(saved);
  }

  remove(agentId: string, talentId: string): Promise<void> {
    this.rows.delete(this.key(agentId, talentId));
    return Promise.resolve();
  }

  count(agentId: string): Promise<number> {
    return Promise.resolve(this.mine(agentId).length);
  }

  page(
    agentId: string,
    after: { savedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<ShortlistEntry[]> {
    const before = (entry: ShortlistEntry) =>
      !after ||
      entry.savedAt < after.savedAt ||
      (entry.savedAt.getTime() === after.savedAt.getTime() && entry.talentId < after.talentId);
    return Promise.resolve(this.mine(agentId).filter(before).slice(0, limit));
  }

  all(agentId: string): Promise<ShortlistEntry[]> {
    return Promise.resolve(this.mine(agentId));
  }

  private mine(agentId: string): ShortlistEntry[] {
    return [...this.rows.values()]
      .filter((entry) => entry.agentId === agentId)
      .sort(
        (a, b) => b.savedAt.getTime() - a.savedAt.getTime() || b.talentId.localeCompare(a.talentId),
      );
  }
}
