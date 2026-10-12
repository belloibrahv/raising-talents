import {
  MODERATION_PAGE_SIZE,
  type HeldMediaPage,
  type MediaRemoval,
  type ModerationDecision,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { ScheduledJob } from '../../../platform/scheduling/job-scheduler.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { isActiveStaff } from '../../accounts/application/staff.js';
import type { ProfileAccounts } from '../../talent-profiles/application/ports.js';
import { MediaErrors, type MediaAssetRepository } from '../domain/media-asset.js';
import type { MediaPresenter } from './media-presenter.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';

const notStaff = () => domainError('FORBIDDEN', 'Only moderators can do this.');

async function ensureStaff(accounts: ProfileAccounts, userId: string): Promise<DomainError | null> {
  return isActiveStaff(await accounts.profileContext(userId)) ? null : notStaff();
}

/** An opaque position in the queue: when the item was held, and its id to break ties. */

const pageAfter = (cursor: string | undefined) => {
  const after = decodeCursor(cursor);
  return after ? { heldAt: after.at, id: after.id } : null;
};

export class ListHeldMediaQuery {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly accounts: ProfileAccounts,
    private readonly presenter: MediaPresenter,
  ) {}

  async execute(viewerId: string, cursor?: string): Promise<Result<HeldMediaPage, DomainError>> {
    const refused = await ensureStaff(this.accounts, viewerId);
    if (refused) return err(refused);
    // One extra row says whether another page exists without counting the queue.
    const rows = await this.assets.findHeld(pageAfter(cursor), MODERATION_PAGE_SIZE + 1);
    const page = rows.slice(0, MODERATION_PAGE_SIZE);
    const items = await Promise.all(
      page.map(async (asset) => {
        const props = asset.snapshot();
        // Recordings are never held, so the queue shows pictures and video only.
        const { urls, video } = await this.presenter.preview(asset);
        return {
          id: props.id,
          ownerId: props.ownerId,
          purpose: props.purpose,
          kind: asset.kind,
          labels: props.moderationLabels.map((label) => ({ ...label })),
          urls,
          video,
          heldAt: props.updatedAt.toISOString(),
        };
      }),
    );
    const last = page.at(-1);
    return ok({
      items,
      nextCursor:
        rows.length > MODERATION_PAGE_SIZE && last
          ? encodeCursor(last.snapshot().updatedAt, last.id)
          : null,
    });
  }
}

/** Approves or rejects held media. The worker then attaches, or removes, the file. */
export class DecideHeldMediaHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly accounts: ProfileAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: {
    moderatorId: string;
    mediaId: string;
    decision: ModerationDecision;
  }): Promise<Result<void, DomainError>> {
    const refused = await ensureStaff(this.accounts, input.moderatorId);
    if (refused) return err(refused);
    const result = await this.uow.run(async () => {
      const asset = await this.assets.findById(input.mediaId, { lock: true });
      if (!asset) return err(MediaErrors.notFound());
      const reviewed = asset.review(
        input.decision.decision === 'approve'
          ? { approve: true }
          : { approve: false, category: input.decision.category },
        input.moderatorId,
        this.clock.now(),
      );
      if (!reviewed.ok) return reviewed;
      await this.assets.save(asset);
      return ok(undefined);
    });
    if (result.ok) {
      // The audit trail: who decided what, on which file. The row also keeps reviewer and time.
      this.logger.info(
        { moderatorId: input.moderatorId, mediaId: input.mediaId, decision: input.decision },
        'held media reviewed',
      );
    }
    return result;
  }
}

/**
 * Takes down a photo or video that is already live. The worker then removes the files, takes
 * a profile photo off its profile, and tells the owner which rule it broke.
 */
export class RemovePublishedMediaHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly accounts: ProfileAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: {
    moderatorId: string;
    mediaId: string;
    removal: MediaRemoval;
  }): Promise<Result<void, DomainError>> {
    const refused = await ensureStaff(this.accounts, input.moderatorId);
    if (refused) return err(refused);
    const result = await this.uow.run(async () => {
      const asset = await this.assets.findById(input.mediaId, { lock: true });
      if (!asset) return err(MediaErrors.notFound());
      const removed = asset.takeDown(input.removal.category, input.moderatorId, this.clock.now());
      if (!removed.ok) return removed;
      await this.assets.save(asset);
      return ok(undefined);
    });
    if (result.ok) {
      this.logger.info(
        {
          moderatorId: input.moderatorId,
          mediaId: input.mediaId,
          category: input.removal.category,
        },
        'published media removed',
      );
    }
    return result;
  }
}

const RELEASE_BATCH = 50;

/**
 * With the scanner off (ADR-048), publishes what manual review was holding. It walks the queue
 * once per run, one file per transaction, and leaves anything a scanner flagged for a
 * moderator. Once the queue is empty a run costs one query.
 */
export class ReleaseUnscannedMediaJob implements ScheduledJob {
  readonly name = 'media.release-unscanned';
  readonly everySeconds = 600;

  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    let released = 0;
    let after: { heldAt: Date; id: string } | null = null;
    for (;;) {
      const page = await this.assets.findHeld(after, RELEASE_BATCH);
      for (const candidate of page) {
        const done = await this.uow.run(async () => {
          // A moderator may have decided since the query: only what is still held is released.
          const asset = await this.assets.findById(candidate.id, { lock: true });
          if (!asset?.releaseUnscanned(this.clock.now())) return false;
          await this.assets.save(asset);
          return true;
        });
        if (done) released += 1;
      }
      const last = page.at(-1);
      if (page.length < RELEASE_BATCH || !last) break;
      after = { heldAt: last.snapshot().updatedAt, id: last.id };
    }
    if (released > 0)
      this.logger.warn({ released }, 'content scanning is off: held media published');
  }
}
