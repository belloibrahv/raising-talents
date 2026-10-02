import { and, asc, eq, notInArray } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  Portfolio,
  PortfolioConcurrencyError,
  type PortfolioRepository,
} from '../domain/portfolio.js';
import { portfolioItems, portfolios } from './portfolio.schema.js';

const uniqueViolation = (error: unknown): string | null => {
  const cause =
    (error as { cause?: { code?: string; constraint?: string } }).cause ??
    (error as { code?: string; constraint?: string });
  return cause.code === '23505' ? (cause.constraint ?? '') : null;
};

export class DrizzlePortfolioRepository implements PortfolioRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findByTalentId(
    talentId: string,
    options: { lock?: boolean } = {},
  ): Promise<Portfolio | null> {
    const db = this.uow.executor();
    const query = db.select().from(portfolios).where(eq(portfolios.talentId, talentId)).limit(1);
    const [root] = options.lock ? await query.for('update') : await query;
    if (!root) return null;
    const items = await db
      .select()
      .from(portfolioItems)
      .where(eq(portfolioItems.talentId, talentId))
      .orderBy(asc(portfolioItems.position));
    return Portfolio.restore({
      talentId: root.talentId,
      version: root.version,
      createdAt: root.createdAt,
      updatedAt: root.updatedAt,
      items: items.map((item) => ({
        id: item.id,
        mediaId: item.mediaId,
        kind: item.kind,
        caption: item.caption,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
    });
  }

  async save(portfolio: Portfolio): Promise<void> {
    const props = portfolio.snapshot();
    const db = this.uow.executor();
    try {
      if (!portfolio.isStored) {
        // A plain insert, so a concurrent first change fails on the primary key.
        await db.insert(portfolios).values({
          talentId: props.talentId,
          version: props.version,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
        });
      } else {
        await db
          .update(portfolios)
          .set({ version: props.version, updatedAt: props.updatedAt })
          .where(eq(portfolios.talentId, props.talentId));
      }

      const keep = props.items.map((item) => item.id);
      await db
        .delete(portfolioItems)
        .where(
          keep.length > 0
            ? and(eq(portfolioItems.talentId, props.talentId), notInArray(portfolioItems.id, keep))
            : eq(portfolioItems.talentId, props.talentId),
        );
      for (const [position, item] of props.items.entries()) {
        const values = { ...item, talentId: props.talentId, position };
        await db
          .insert(portfolioItems)
          .values(values)
          .onConflictDoUpdate({
            target: portfolioItems.id,
            set: { caption: item.caption, position, updatedAt: item.updatedAt },
          });
      }
    } catch (error) {
      const constraint = uniqueViolation(error);
      if (constraint === 'items_media_unique') throw new PortfolioConcurrencyError('media');
      if (constraint === 'portfolios_pkey') throw new PortfolioConcurrencyError('portfolio');
      throw error;
    }
    portfolio.markStored();
    await this.events.record(portfolio.pullEvents());
  }
}
