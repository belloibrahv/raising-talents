import { and, asc, eq, gt } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { TalentProfile } from '../domain/talent-profile.js';
import {
  HandleConflictError,
  type TalentProfileRepository,
} from '../domain/talent-profile.repository.js';
import { profiles, profileSkills, profileSubcategories } from './talent-profile.schema.js';

const isHandleConflict = (error: unknown): boolean => {
  const cause =
    (error as { cause?: { code?: string; constraint?: string } }).cause ??
    (error as { code?: string; constraint?: string });
  return cause.code === '23505' && cause.constraint === 'profiles_handle_unique';
};

export class DrizzleTalentProfileRepository implements TalentProfileRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findByUserId(
    userId: string,
    options: { lock?: boolean } = {},
  ): Promise<TalentProfile | null> {
    const query = this.uow
      .executor()
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? this.toDomain(row) : null;
  }

  async findByHandle(handle: string): Promise<TalentProfile | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(profiles)
      .where(eq(profiles.handle, handle))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async findByShareCode(code: string): Promise<TalentProfile | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(profiles)
      .where(eq(profiles.shareCode, code))
      .limit(1);
    return row ? this.toDomain(row) : null;
  }

  async handleExists(handle: string): Promise<boolean> {
    const rows = await this.uow
      .executor()
      .select({ id: profiles.userId })
      .from(profiles)
      .where(eq(profiles.handle, handle))
      .limit(1);
    return rows.length > 0;
  }

  async listCompleteUserIds(after: string | null, limit: number): Promise<string[]> {
    const rows = await this.uow
      .executor()
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(
        after
          ? and(eq(profiles.isComplete, true), gt(profiles.userId, after))
          : eq(profiles.isComplete, true),
      )
      .orderBy(asc(profiles.userId))
      .limit(limit);
    return rows.map((row) => row.userId);
  }

  async save(profile: TalentProfile): Promise<void> {
    const props = profile.snapshot();
    const row = {
      userId: props.userId,
      handle: props.handle,
      displayName: props.displayName,
      bio: props.bio,
      categorySlug: props.categorySlug,
      citySlug: props.citySlug,
      gender: props.gender,
      genderSearchable: props.genderSearchable,
      publicLink: props.publicLink,
      shareCode: props.shareCode,
      pendingAvatarMediaId: props.pendingAvatarMediaId,
      avatarMediaId: props.avatarMediaId,
      isComplete: profile.isComplete,
      completedAt: props.completedAt,
      verifiedAt: props.verifiedAt,
      version: props.version,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
    const db = this.uow.executor();
    try {
      await db
        .insert(profiles)
        .values(row)
        .onConflictDoUpdate({ target: profiles.userId, set: { ...row, createdAt: undefined } });
    } catch (error) {
      if (isHandleConflict(error)) throw new HandleConflictError(props.handle);
      throw error;
    }
    await db.delete(profileSubcategories).where(eq(profileSubcategories.userId, props.userId));
    if (props.subcategorySlugs.length > 0) {
      await db.insert(profileSubcategories).values(
        props.subcategorySlugs.map((subcategorySlug, position) => ({
          userId: props.userId,
          subcategorySlug,
          position,
        })),
      );
    }
    await db.delete(profileSkills).where(eq(profileSkills.userId, props.userId));
    if (props.skillSlugs.length > 0) {
      await db.insert(profileSkills).values(
        props.skillSlugs.map((skillSlug, position) => ({
          userId: props.userId,
          skillSlug,
          position,
        })),
      );
    }
    await this.events.record(profile.pullEvents());
  }

  private async toDomain(row: typeof profiles.$inferSelect): Promise<TalentProfile> {
    const db = this.uow.executor();
    const [subRows, skillRows] = await Promise.all([
      db
        .select()
        .from(profileSubcategories)
        .where(eq(profileSubcategories.userId, row.userId))
        .orderBy(asc(profileSubcategories.position)),
      db
        .select()
        .from(profileSkills)
        .where(eq(profileSkills.userId, row.userId))
        .orderBy(asc(profileSkills.position)),
    ]);
    return TalentProfile.restore({
      userId: row.userId,
      handle: row.handle,
      displayName: row.displayName,
      bio: row.bio,
      categorySlug: row.categorySlug,
      subcategorySlugs: subRows.map((sub) => sub.subcategorySlug),
      skillSlugs: skillRows.map((skill) => skill.skillSlug),
      citySlug: row.citySlug,
      gender: row.gender,
      genderSearchable: row.genderSearchable,
      publicLink: row.publicLink,
      shareCode: row.shareCode,
      pendingAvatarMediaId: row.pendingAvatarMediaId,
      avatarMediaId: row.avatarMediaId,
      completedAt: row.completedAt,
      verifiedAt: row.verifiedAt,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
