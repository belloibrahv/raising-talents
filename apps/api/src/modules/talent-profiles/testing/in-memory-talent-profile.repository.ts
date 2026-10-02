import type { EventRecorder } from '../../../platform/domain-event.js';
import { TalentProfile } from '../domain/talent-profile.js';
import {
  HandleConflictError,
  type TalentProfileRepository,
} from '../domain/talent-profile.repository.js';

export class InMemoryTalentProfileRepository implements TalentProfileRepository {
  readonly rows = new Map<string, ReturnType<TalentProfile['snapshot']>>();

  constructor(private readonly events: EventRecorder) {}

  async findByUserId(userId: string): Promise<TalentProfile | null> {
    const row = this.rows.get(userId);
    return row ? TalentProfile.restore(row) : null;
  }

  async findByHandle(handle: string): Promise<TalentProfile | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.handle === handle);
    return row ? TalentProfile.restore(row) : null;
  }

  async handleExists(handle: string): Promise<boolean> {
    return [...this.rows.values()].some((candidate) => candidate.handle === handle);
  }

  async save(profile: TalentProfile): Promise<void> {
    const props = profile.snapshot();
    const clash = [...this.rows.values()].find(
      (row) => row.handle === props.handle && row.userId !== props.userId,
    );
    if (clash) throw new HandleConflictError(props.handle);
    this.rows.set(props.userId, props);
    await this.events.record(profile.pullEvents());
  }
}
