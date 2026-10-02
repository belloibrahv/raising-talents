import {
  ErrorCode,
  PORTFOLIO_MAX_ITEMS,
  type MediaStatus,
  type PortfolioItemKind,
} from '@rt/contracts';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';

export const PortfolioEvents = {
  ItemAdded: 'portfolio.PortfolioItemAdded',
  ItemRemoved: 'portfolio.PortfolioItemRemoved',
} as const;

export const PortfolioErrors = {
  wrongRole: () => domainError(ErrorCode.WrongRole, 'Only talent accounts have a portfolio.'),
  emailNotVerified: () =>
    domainError(ErrorCode.EmailNotVerified, 'Verify your email before adding to your portfolio.'),
  itemNotFound: () => domainError(ErrorCode.NotFound, 'This item is not in your portfolio.'),
  mediaNotFound: () => domainError(ErrorCode.NotFound, 'This file does not exist.'),
  mediaNotUploaded: () =>
    domainError(ErrorCode.MediaNotUploaded, 'Finish the upload before adding it.'),
  mediaUnusable: (status: MediaStatus) =>
    domainError(
      ErrorCode.MediaWrongState,
      `This file is ${status.replaceAll('_', ' ')} and cannot be added. Upload another.`,
    ),
  mediaWrongPurpose: () =>
    domainError(ErrorCode.MediaWrongPurpose, 'This file was uploaded for something else.'),
  mediaAlreadyUsed: () =>
    domainError(ErrorCode.MediaAlreadyUsed, 'This file is already in your portfolio.'),
  full: () =>
    domainError(
      ErrorCode.PortfolioFull,
      `A portfolio holds up to ${String(PORTFOLIO_MAX_ITEMS)} items. Remove one to add another.`,
    ),
  versionRequired: () =>
    domainError(
      ErrorCode.PreconditionRequired,
      'Send the If-Match header from your last read of the portfolio.',
    ),
  staleVersion: () =>
    domainError(
      ErrorCode.PreconditionFailed,
      'Your portfolio changed on another device. Reload it and try again.',
    ),
  orderMismatch: () =>
    domainError(ErrorCode.PortfolioOrderMismatch, 'Send every item in the portfolio exactly once.'),
  concurrentChange: () =>
    domainError(ErrorCode.Conflict, 'Your portfolio changed at the same moment. Try again.'),
};

/** Media states an item can be added in: uploaded and not finally refused. */
const ATTACHABLE: readonly MediaStatus[] = ['processing', 'scanning', 'ready', 'held_for_review'];

export interface PortfolioItemProps {
  readonly id: string;
  readonly mediaId: string;
  readonly kind: PortfolioItemKind;
  readonly caption: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PortfolioProps {
  readonly talentId: string;
  /** 0 until the first change is saved. Every change adds one. */
  readonly version: number;
  /** In display order. */
  readonly items: readonly PortfolioItemProps[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** What the aggregate needs to know about a file before it accepts it. */
export interface CandidateMedia {
  readonly ownerId: string;
  readonly purpose: string;
  readonly status: MediaStatus;
}

/**
 * A talent's ordered portfolio. One root per talent, so the item limit and the
 * order are checked against a single locked row.
 */
export class Portfolio {
  private pendingEvents: DomainEvent[] = [];

  private constructor(
    private props: PortfolioProps,
    private stored: boolean,
  ) {}

  static empty(talentId: string, now: Date): Portfolio {
    return new Portfolio(
      { talentId, version: 0, items: [], createdAt: now, updatedAt: now },
      false,
    );
  }

  static restore(props: PortfolioProps): Portfolio {
    return new Portfolio(props, true);
  }

  /** False until the repository first saves it; tells the repository to insert, not update. */
  get isStored(): boolean {
    return this.stored;
  }

  markStored(): void {
    this.stored = true;
  }

  get talentId(): string {
    return this.props.talentId;
  }
  get version(): number {
    return this.props.version;
  }
  get items(): readonly PortfolioItemProps[] {
    return this.props.items;
  }

  snapshot(): PortfolioProps {
    return { ...this.props, items: [...this.props.items] };
  }

  addItem(input: {
    id: string;
    mediaId: string;
    media: CandidateMedia | null;
    caption: string;
    now: Date;
  }): Result<PortfolioItemProps, DomainError> {
    const { media } = input;
    if (media?.ownerId !== this.props.talentId) return err(PortfolioErrors.mediaNotFound());
    if (media.purpose !== 'portfolio') return err(PortfolioErrors.mediaWrongPurpose());
    if (media.status === 'awaiting_upload') return err(PortfolioErrors.mediaNotUploaded());
    if (!ATTACHABLE.includes(media.status)) return err(PortfolioErrors.mediaUnusable(media.status));
    if (this.props.items.some((item) => item.mediaId === input.mediaId))
      return err(PortfolioErrors.mediaAlreadyUsed());
    if (this.props.items.length >= PORTFOLIO_MAX_ITEMS) return err(PortfolioErrors.full());

    const item: PortfolioItemProps = {
      id: input.id,
      mediaId: input.mediaId,
      kind: 'image',
      caption: input.caption,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.change({ items: [...this.props.items, item] }, input.now);
    this.raise(PortfolioEvents.ItemAdded, item, input.now);
    return ok(item);
  }

  updateCaption(itemId: string, caption: string, now: Date): Result<void, DomainError> {
    const current = this.props.items.find((item) => item.id === itemId);
    if (!current) return err(PortfolioErrors.itemNotFound());
    if (current.caption === caption) return ok(undefined);
    this.change(
      {
        items: this.props.items.map((item) =>
          item.id === itemId ? { ...item, caption, updatedAt: now } : item,
        ),
      },
      now,
    );
    return ok(undefined);
  }

  /** Returns the removed item so the caller can release its media. */
  removeItem(itemId: string, now: Date): Result<PortfolioItemProps, DomainError> {
    const removed = this.props.items.find((item) => item.id === itemId);
    if (!removed) return err(PortfolioErrors.itemNotFound());
    this.change({ items: this.props.items.filter((item) => item.id !== itemId) }, now);
    this.raise(PortfolioEvents.ItemRemoved, removed, now);
    return ok(removed);
  }

  /** The new order must name every current item once: no partial lists, no stale ids. */
  reorder(itemIds: readonly string[], now: Date): Result<void, DomainError> {
    const byId = new Map(this.props.items.map((item) => [item.id, item]));
    if (itemIds.length !== byId.size || new Set(itemIds).size !== itemIds.length)
      return err(PortfolioErrors.orderMismatch());
    const ordered: PortfolioItemProps[] = [];
    for (const id of itemIds) {
      const item = byId.get(id);
      if (!item) return err(PortfolioErrors.orderMismatch());
      ordered.push(item);
    }
    if (ordered.every((item, index) => item.id === this.props.items[index]?.id))
      return ok(undefined);
    this.change({ items: ordered }, now);
    return ok(undefined);
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private change(patch: Pick<PortfolioProps, 'items'>, now: Date): void {
    this.props = { ...this.props, ...patch, version: this.props.version + 1, updatedAt: now };
  }

  private raise(type: string, item: PortfolioItemProps, occurredAt: Date): void {
    this.pendingEvents.push({
      type,
      aggregateId: this.props.talentId,
      occurredAt,
      payload: { itemId: item.id, mediaId: item.mediaId, kind: item.kind },
    });
  }
}

export class PortfolioConcurrencyError extends Error {
  constructor(readonly reason: 'portfolio' | 'media') {
    super(`Concurrent portfolio change (${reason})`);
  }
}

export interface PortfolioRepository {
  /** With lock: true the root row stays locked until the transaction ends. */
  findByTalentId(talentId: string, options?: { lock?: boolean }): Promise<Portfolio | null>;
  /**
   * Throws PortfolioConcurrencyError when another transaction created the portfolio
   * first, or already attached the same media.
   */
  save(portfolio: Portfolio): Promise<void>;
}
