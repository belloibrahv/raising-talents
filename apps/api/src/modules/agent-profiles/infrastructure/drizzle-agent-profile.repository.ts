import { asc, eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { AgentProfile, type AgentProfileRepository } from '../domain/agent-profile.js';
import { agentProfiles, agentSpecializations } from './agent-profile.schema.js';

export class DrizzleAgentProfileRepository implements AgentProfileRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findByUserId(
    userId: string,
    options: { lock?: boolean } = {},
  ): Promise<AgentProfile | null> {
    const db = this.uow.executor();
    const query = db.select().from(agentProfiles).where(eq(agentProfiles.userId, userId)).limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    if (!row) return null;
    const specializations = await db
      .select()
      .from(agentSpecializations)
      .where(eq(agentSpecializations.userId, userId))
      .orderBy(asc(agentSpecializations.position));
    return AgentProfile.restore({
      ...row,
      specializationSlugs: specializations.map((item) => item.categorySlug),
    });
  }

  async save(profile: AgentProfile): Promise<void> {
    const { specializationSlugs, ...row } = profile.snapshot();
    const db = this.uow.executor();
    await db
      .insert(agentProfiles)
      .values(row)
      .onConflictDoUpdate({ target: agentProfiles.userId, set: { ...row, createdAt: undefined } });
    await db.delete(agentSpecializations).where(eq(agentSpecializations.userId, row.userId));
    if (specializationSlugs.length > 0) {
      await db.insert(agentSpecializations).values(
        specializationSlugs.map((categorySlug, position) => ({
          userId: row.userId,
          categorySlug,
          position,
        })),
      );
    }
    await this.events.record(profile.pullEvents());
  }
}
