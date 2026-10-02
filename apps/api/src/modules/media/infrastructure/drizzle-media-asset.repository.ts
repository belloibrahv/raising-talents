import { eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { MediaAsset, type MediaAssetRepository } from '../domain/media-asset.js';
import { assets } from './media.schema.js';

export class DrizzleMediaAssetRepository implements MediaAssetRepository {
  constructor(
    private readonly uow: DrizzleUnitOfWork,
    private readonly events: EventRecorder,
  ) {}

  async findById(id: string, options: { lock?: boolean } = {}): Promise<MediaAsset | null> {
    const query = this.uow.executor().select().from(assets).where(eq(assets.id, id)).limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? MediaAsset.restore(row) : null;
  }

  async save(asset: MediaAsset): Promise<void> {
    const row = asset.snapshot();
    const values = { ...row, moderationLabels: [...row.moderationLabels] };
    await this.uow
      .executor()
      .insert(assets)
      .values(values)
      .onConflictDoUpdate({ target: assets.id, set: { ...values, createdAt: undefined } });
    await this.events.record(asset.pullEvents());
  }
}
