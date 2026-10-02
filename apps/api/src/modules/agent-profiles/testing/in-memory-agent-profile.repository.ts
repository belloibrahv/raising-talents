import type { EventRecorder } from '../../../platform/domain-event.js';
import { AgentProfile, type AgentProfileRepository } from '../domain/agent-profile.js';

export class InMemoryAgentProfileRepository implements AgentProfileRepository {
  readonly rows = new Map<string, ReturnType<AgentProfile['snapshot']>>();

  constructor(private readonly events: EventRecorder) {}

  async findByUserId(userId: string): Promise<AgentProfile | null> {
    const row = this.rows.get(userId);
    return row ? AgentProfile.restore(row) : null;
  }

  async save(profile: AgentProfile): Promise<void> {
    this.rows.set(profile.userId, profile.snapshot());
    await this.events.record(profile.pullEvents());
  }
}
