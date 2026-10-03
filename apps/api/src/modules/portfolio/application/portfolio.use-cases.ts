import {
  PORTFOLIO_MAX_ITEMS,
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
  Update: Symbol('UpdatePortfolioItemHandler'),
  Remove: Symbol('RemovePortfolioItemHandler'),
  Reorder: Symbol('ReorderPortfolioHandler'),
  GetPublic: Symbol('GetPublicPortfolioQuery'),
} as const;

/** What the portfolio needs from accounts. */
export interface PortfolioAccounts {
  profileContext(userId: string): Promise<{ role: Role | null; emailVerified: boolean } | null>;
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
      }
    >
  >;
  discard(mediaId: string, ownerId: string): Promise<void>;
}

/** What the portfolio needs from talent profiles. Implemented by TalentDirectory. */
export interface PortfolioTalents {
  visibleUserId(handle: string): Promise<string | null>;
}

async function present(portfolio: Portfolio, media: PortfolioMedia): Promise<MyPortfolio> {
  const described = await media.describe(portfolio.items.map((item) => item.mediaId));
  return {
    items: portfolio.items.map((item) => {
      const file = described.get(item.mediaId);
      return {
        id: item.id,
        kind: item.kind,
        mediaId: item.mediaId,
        // A missing asset can only mean it was removed underneath us; show it as gone.
        mediaStatus: file?.status ?? 'deleted',
        caption: item.caption,
        urls: file?.urls ?? null,
        video: file?.video ?? null,
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
      if (removed.ok) await this.media.discard(removed.value.mediaId, input.userId);
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
    const described = await this.media.describe(portfolio.items.map((item) => item.mediaId));
    return ok({
      items: portfolio.items.flatMap((item): PublicPortfolio['items'] => {
        const file = described.get(item.mediaId);
        if (file?.status !== 'ready') return [];
        const shared = { id: item.id, caption: item.caption };
        if (file.urls) return [{ ...shared, kind: 'image', urls: file.urls }];
        if (file.video) return [{ ...shared, kind: 'video', video: file.video }];
        return [];
      }),
    });
  }
}
