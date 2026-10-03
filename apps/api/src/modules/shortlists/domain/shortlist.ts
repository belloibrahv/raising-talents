/** A talent an agent saved, with the agent's private note. The talent is never told. */
export interface ShortlistEntry {
  readonly agentId: string;
  readonly talentId: string;
  readonly note: string;
  readonly savedAt: Date;
  readonly updatedAt: Date;
}

export interface ShortlistRepository {
  find(agentId: string, talentId: string): Promise<ShortlistEntry | null>;
  /** Inserts or replaces the note. The first saved date never changes. */
  save(entry: ShortlistEntry): Promise<ShortlistEntry>;
  remove(agentId: string, talentId: string): Promise<void>;
  count(agentId: string): Promise<number>;
  /** Newest first. */
  page(
    agentId: string,
    after: { savedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<ShortlistEntry[]>;
  all(agentId: string): Promise<ShortlistEntry[]>;
}
