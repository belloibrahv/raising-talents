import { MODERATION_PAGE_SIZE, type HeldMediaPage, type ModerationDecision } from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { ProfileAccounts } from '../../talent-profiles/application/ports.js';
import { MediaErrors, type MediaAssetRepository } from '../domain/media-asset.js';
import type { MediaPresenter } from './media-presenter.js';

const STAFF = new Set(['moderator', 'admin']);

const notStaff = () => domainError('FORBIDDEN', 'Only moderators can do this.');

async function ensureStaff(accounts: ProfileAccounts, userId: string): Promise<DomainError | null> {
  const account = await accounts.profileContext(userId);
  return account?.role && STAFF.has(account.role) && account.status === 'active'
    ? null
    : notStaff();
}

/** An opaque position in the queue: when the item was held, and its id to break ties. */
const encodeCursor = (heldAt: Date, id: string) =>
  Buffer.from(`${heldAt.toISOString()}|${id}`).toString('base64url');

function decodeCursor(cursor: string | undefined): { heldAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const heldAt = new Date(iso ?? '');
  return id && !Number.isNaN(heldAt.getTime()) ? { heldAt, id } : null;
}

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
    const rows = await this.assets.findHeld(decodeCursor(cursor), MODERATION_PAGE_SIZE + 1);
    const page = rows.slice(0, MODERATION_PAGE_SIZE);
    const items = await Promise.all(
      page.map(async (asset) => {
        const props = asset.snapshot();
        return {
          id: props.id,
          ownerId: props.ownerId,
          purpose: props.purpose,
          kind: asset.kind,
          labels: props.moderationLabels.map((label) => ({ ...label })),
          ...(await this.presenter.preview(asset)),
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
