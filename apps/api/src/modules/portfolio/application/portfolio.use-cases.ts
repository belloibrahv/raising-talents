import {
  type SharedTalentProfile,
  PORTFOLIO_MAX_ITEMS,
  type AccountStatus,
  type AudioPlayback,
  type ImageUrls,
  type MediaKind,
  type MediaStatus,
  type MyPortfolio,
  type PublicPortfolio,
  type Role,
  type VideoPlayback,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { newId } from '../../../platform/ids.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { isActiveStaff } from '../../accounts/application/staff.js';
import {
  Portfolio,
  PortfolioConcurrencyError,
  PortfolioErrors,
  type PortfolioRepository,
} from '../domain/portfolio.js';

export const PORTFOLIO = {
  Repository: Symbol('PortfolioRepository'),
  Accounts: Symbol('PortfolioAccounts'),
  Media: Symbol('PortfolioMedia'),
  Talents: Symbol('PortfolioTalents'),
  GetMine: Symbol('GetMyPortfolioQuery'),
  Add: Symbol('AddPortfolioItemHandler'),
  AddText: Symbol('AddTextPostHandler'),
  RemoveText: Symbol('RemoveTextPostHandler'),
  Update: Symbol('UpdatePortfolioItemHandler'),
  Remove: Symbol('RemovePortfolioItemHandler'),
  Reorder: Symbol('ReorderPortfolioHandler'),
  GetPublic: Symbol('GetPublicPortfolioQuery'),
  Shared: Symbol('SharedTalentProfileQuery'),
} as const;

/** What the portfolio needs from accounts. */
export interface PortfolioAccounts {
  profileContext(
    userId: string,
  ): Promise<{ role: Role | null; status: AccountStatus; emailVerified: boolean } | null>;
}

/** What the portfolio needs from media. Implemented by MediaFacade. */
export interface PortfolioMedia {
  describe(ids: readonly string[]): Promise<
    Map<
      string,
      {
        ownerId: string;
        purpose: string;
        kind: MediaKind;
        status: MediaStatus;
        rejectionReason: string | null;
        urls: ImageUrls | null;
        video: VideoPlayback | null;
        audio: AudioPlayback | null;
      }
    >
  >;
  discard(mediaId: string, ownerId: string): Promise<void>;
}

/** What the portfolio needs from talent profiles. Implemented by TalentDirectory. */
export interface PortfolioTalents {
  visibleUserId(handle: string): Promise<string | null>;
  shareable(
    handle: string,
  ): Promise<(Omit<SharedTalentProfile, 'portfolio'> & { userId: string }) | null>;
}

const mediaIdsOf = (items: readonly { mediaId: string | null }[]): string[] =>
  items.flatMap((item) => (item.mediaId === null ? [] : [item.mediaId]));

/** What others see of one item: a text post as it is, anything else only once its file is ready. */
function publicItem(
  item: { id: string; kind: string; caption: string; mediaId: string | null },
  described: Awaited<ReturnType<PortfolioMedia['describe']>>,
): PublicPortfolio['items'] {
  const shared = { id: item.id, caption: item.caption };
  if (item.mediaId === null) return item.kind === 'text' ? [{ ...shared, kind: 'text' }] : [];
  const file = described.get(item.mediaId);
  if (file?.status !== 'ready') return [];
  if (file.urls) return [{ ...shared, kind: 'image', urls: file.urls }];
  if (file.video) return [{ ...shared, kind: 'video', video: file.video }];
  if (file.audio) return [{ ...shared, kind: 'audio', audio: file.audio }];
  return [];
}

async function present(portfolio: Portfolio, media: PortfolioMedia): Promise<MyPortfolio> {
  const described = await media.describe(mediaIdsOf(portfolio.items));
  return {
    items: portfolio.items.map((item) => {
      const file = item.mediaId === null ? undefined : described.get(item.mediaId);
      return {
        id: item.id,
        kind: item.kind,
        mediaId: item.mediaId,
        // A text post has no file to wait for. A missing asset can only mean it was removed
        // underneath us; show it as gone.
        mediaStatus: item.mediaId === null ? ('ready' as const) : (file?.status ?? 'deleted'),
        caption: item.caption,
        urls: file?.urls ?? null,
        video: file?.video ?? null,
        audio: file?.audio ?? null,
        rejectionReason: file?.rejectionReason ?? null,
        createdAt: item.createdAt.toISOString(),
      };
    }),
    maxItems: PORTFOLIO_MAX_ITEMS,
    version: portfolio.version,
  };
}

/** Shared by every owner-side use case: talent only, and the portfolio row locked for writes. */
abstract class OwnerPortfolioUseCase {
  constructor(
    protected readonly portfolios: PortfolioRepository,
    protected readonly accounts: PortfolioAccounts,
    protected readonly media: PortfolioMedia,
    protected readonly uow: UnitOfWork,
    protected readonly clock: Clock,
  ) {}

  protected async checkTalent(userId: string): Promise<DomainError | null> {
    const account = await this.accounts.profileContext(userId);
    return account?.role === 'talent' ? null : PortfolioErrors.wrongRole();
  }

  /** Loads (or starts) the portfolio under lock, applies the change, saves and presents it. */
  protected async mutate(
    userId: string,
    change: (
      portfolio: Portfolio,
      now: Date,
    ) => Result<unknown, DomainError> | Promise<Result<unknown, DomainError>>,
  ): Promise<Result<MyPortfolio, DomainError>> {
    try {
      const saved = await this.uow.run(async () => {
        const now = this.clock.now();
        const portfolio =
          (await this.portfolios.findByTalentId(userId, { lock: true })) ??
          Portfolio.empty(userId, now);
        const before = portfolio.version;
        const changed = await change(portfolio, now);
        if (!changed.ok) return changed;
        if (portfolio.version !== before) await this.portfolios.save(portfolio);
        return ok(portfolio);
      });
      if (!saved.ok) return saved;
      return ok(await present(saved.value, this.media));
    } catch (error) {
      if (!(error instanceof PortfolioConcurrencyError)) throw error;
      return err(
        error.reason === 'media'
          ? PortfolioErrors.mediaAlreadyUsed()
          : PortfolioErrors.concurrentChange(),
      );
    }
  }
}

export class GetMyPortfolioQuery {
  constructor(
    private readonly portfolios: PortfolioRepository,
    private readonly accounts: PortfolioAccounts,
    private readonly media: PortfolioMedia,
    private readonly clock: Clock,
  ) {}

  /** A talent who has added nothing yet gets an empty portfolio at version 0. */
  async execute(userId: string): Promise<Result<MyPortfolio, DomainError>> {
    const account = await this.accounts.profileContext(userId);
    if (account?.role !== 'talent') return err(PortfolioErrors.wrongRole());
    const portfolio =
      (await this.portfolios.findByTalentId(userId)) ?? Portfolio.empty(userId, this.clock.now());
    return ok(await present(portfolio, this.media));
  }
}

export class AddPortfolioItemHandler extends OwnerPortfolioUseCase {
  async execute(input: {
    userId: string;
    mediaId: string;
    caption?: string | undefined;
  }): Promise<Result<MyPortfolio, DomainError>> {
    const refused = await this.checkTalent(input.userId);
    if (refused) return err(refused);
    return this.mutate(input.userId, async (portfolio, now) => {
      const media = (await this.media.describe([input.mediaId])).get(input.mediaId) ?? null;
      return portfolio.addItem({
        id: newId(),
        mediaId: input.mediaId,
        media,
        caption: input.caption ?? '',
        now,
      });
    });
  }
}

export class AddTextPostHandler extends OwnerPortfolioUseCase {
  /** Words on their own: nothing to upload, so it is live as soon as it is saved (ADR-057). */
  async execute(input: {
    userId: string;
    text: string;
  }): Promise<Result<MyPortfolio, DomainError>> {
    const refused = await this.checkTalent(input.userId);
    if (refused) return err(refused);
    return this.mutate(input.userId, (portfolio, now) =>
      portfolio.addText({ id: newId(), text: input.text, now }),
    );
  }
}

/**
 * A moderator takes down a text post. A post with a file is taken down through its media
 * instead, which also deletes the file and tells the owner which rule it broke.
 */
export class RemoveTextPostHandler extends OwnerPortfolioUseCase {
  async execute(input: {
    moderatorId: string;
    itemId: string;
  }): Promise<Result<void, DomainError>> {
    if (!isActiveStaff(await this.accounts.profileContext(input.moderatorId))) {
      return err(domainError('FORBIDDEN', 'Only moderators can do this.'));
    }
    const ownerId = await this.portfolios.findOwnerOfItem(input.itemId);
    if (!ownerId) return err(PortfolioErrors.itemNotFound());
    const removed = await this.mutate(ownerId, (portfolio, now) => {
      const item = portfolio.items.find((entry) => entry.id === input.itemId);
      if (!item) return err(PortfolioErrors.itemNotFound());
      if (item.kind !== 'text') return err(PortfolioErrors.notATextPost());
      return portfolio.removeItem(input.itemId, now);
    });
    return removed.ok ? ok(undefined) : removed;
  }
}

export class UpdatePortfolioItemHandler extends OwnerPortfolioUseCase {
  async execute(input: {
    userId: string;
    itemId: string;
    caption: string;
  }): Promise<Result<MyPortfolio, DomainError>> {
    const refused = await this.checkTalent(input.userId);
    if (refused) return err(refused);
    return this.mutate(input.userId, (portfolio, now) =>
      portfolio.updateCaption(input.itemId, input.caption, now),
    );
  }
}

export class RemovePortfolioItemHandler extends OwnerPortfolioUseCase {
  /** The item and its media go in one transaction, so a file is never left half attached. */
  async execute(input: {
    userId: string;
    itemId: string;
  }): Promise<Result<MyPortfolio, DomainError>> {
    const refused = await this.checkTalent(input.userId);
    if (refused) return err(refused);
    return this.mutate(input.userId, async (portfolio, now) => {
      const removed = portfolio.removeItem(input.itemId, now);
      if (removed.ok && removed.value.mediaId !== null) {
        await this.media.discard(removed.value.mediaId, input.userId);
      }
      return removed;
    });
  }
}

export class ReorderPortfolioHandler extends OwnerPortfolioUseCase {
  async execute(input: {
    userId: string;
    expectedVersion: number | null;
    itemIds: readonly string[];
  }): Promise<Result<MyPortfolio, DomainError>> {
    const refused = await this.checkTalent(input.userId);
    if (refused) return err(refused);
    if (input.expectedVersion === null) return err(PortfolioErrors.versionRequired());
    const expected = input.expectedVersion;
    return this.mutate(input.userId, (portfolio, now) => {
      if (portfolio.version !== expected) return err(PortfolioErrors.staleVersion());
      return portfolio.reorder(input.itemIds, now);
    });
  }
}

export class GetPublicPortfolioQuery {
  constructor(
    private readonly portfolios: PortfolioRepository,
    private readonly talents: PortfolioTalents,
    private readonly media: PortfolioMedia,
  ) {}

  /** Same 404 as the profile for anyone not visible. Only ready media is listed. */
  async execute(handle: string): Promise<Result<PublicPortfolio, DomainError>> {
    const talentId = await this.talents.visibleUserId(handle);
    if (!talentId) return err(domainError('NOT_FOUND', 'This profile is not available.'));
    const portfolio = await this.portfolios.findByTalentId(talentId);
    if (!portfolio) return ok({ items: [] });
    const described = await this.media.describe(mediaIdsOf(portfolio.items));
    return ok({ items: portfolio.items.flatMap((item) => publicItem(item, described)) });
  }
}

/** Generous for real visitors, tight enough to stop someone walking every handle. */
export const SHARED_PROFILE_LIMIT = { perMinute: 60, windowSeconds: 60 } as const;

/** The shareable page: the profile and its ready media, for anyone with the link (ADR-042). */
export class SharedTalentProfileQuery {
  constructor(
    private readonly portfolios: PortfolioRepository,
    private readonly talents: PortfolioTalents,
    private readonly media: PortfolioMedia,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async execute(code: string, clientIp: string): Promise<Result<SharedTalentProfile, DomainError>> {
    const limit = await this.rateLimiter.consume(
      `shared-profile:${clientIp}`,
      SHARED_PROFILE_LIMIT.perMinute,
      SHARED_PROFILE_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'Too many profiles opened. Wait a minute.',
          limit.retryAfterSeconds,
        ),
      );
    }
    const shared = await this.talents.shareable(code);
    if (!shared) return err(domainError('NOT_FOUND', 'This profile is not available.'));
    const { userId, ...profile } = shared;
    const portfolio = await this.portfolios.findByTalentId(userId);
    const described = await this.media.describe(mediaIdsOf(portfolio?.items ?? []));
    return ok({
      ...profile,
      portfolio: (portfolio?.items ?? []).flatMap((item) => publicItem(item, described)),
    });
  }
}
