import type {
  DataExport,
  MeResponse,
  MyAgentProfile,
  MyAgentVerification,
  MyPortfolio,
  MyTalentProfile,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';

export const PRIVACY = {
  RequestDeletion: Symbol('RequestDeletionHandler'),
  CancelDeletion: Symbol('CancelDeletionHandler'),
  Export: Symbol('ExportMyDataQuery'),
  Erasure: Symbol('AccountErasureJob'),
} as const;

/** What privacy needs from accounts. Implemented by AccountsFacade. */
export interface PrivacyAccounts {
  requestDeletion(userId: string, graceDays: number): Promise<Result<Date, DomainError>>;
  cancelDeletion(userId: string): Promise<Result<void, DomainError>>;
  dueForDeletion(limit: number): Promise<string[]>;
  erase(userId: string): Promise<void>;
  getMe(userId: string): Promise<Result<MeResponse, DomainError>>;
  exportFacts(userId: string): Promise<DataExport['account'] | null>;
}

export interface PrivacyIdentity {
  passwordMatches(userId: string, password: string): Promise<boolean>;
}

export interface PrivacyMedia {
  listForOwner(ownerId: string): Promise<readonly DataExport['media'][number][]>;
  purgeOwnerFiles(ownerId: string): Promise<number>;
}

/** The "get mine" queries of each module; a wrong role or a missing profile is simply absent. */
export interface PrivacySources {
  talentProfile(userId: string): Promise<Result<MyTalentProfile, DomainError>>;
  agentProfile(userId: string): Promise<Result<MyAgentProfile, DomainError>>;
  agentVerification(userId: string): Promise<Result<MyAgentVerification, DomainError>>;
  portfolio(userId: string): Promise<Result<MyPortfolio, DomainError>>;
  shortlist(userId: string): Promise<DataExport['shortlist']>;
  notifications(userId: string): Promise<DataExport['notifications']>;
}

export const DELETION_CONFIRM_LIMIT = { perUser: 5, windowSeconds: 900 } as const;
export const EXPORT_LIMIT = { perUser: 5, windowSeconds: 86_400 } as const;

/** Schedules deletion after checking the password, so a borrowed, unlocked phone cannot do it. */
export class RequestDeletionHandler {
  constructor(
    private readonly accounts: PrivacyAccounts,
    private readonly identity: PrivacyIdentity,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly graceDays: number,
  ) {}

  async execute(userId: string, password: string): Promise<Result<MeResponse, DomainError>> {
    const limit = await this.rateLimiter.consume(
      `delete-account:${userId}`,
      DELETION_CONFIRM_LIMIT.perUser,
      DELETION_CONFIRM_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'Too many attempts. Wait a few minutes.',
          limit.retryAfterSeconds,
        ),
      );
    }
    if (!(await this.identity.passwordMatches(userId, password))) {
      return err(domainError('INVALID_CREDENTIALS', 'That password is not right.'));
    }
    const scheduled = await this.uow.run(() =>
      this.accounts.requestDeletion(userId, this.graceDays),
    );
    if (!scheduled.ok) return scheduled;
    return this.accounts.getMe(userId);
  }
}

export class CancelDeletionHandler {
  constructor(
    private readonly accounts: PrivacyAccounts,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(userId: string): Promise<Result<MeResponse, DomainError>> {
    const cancelled = await this.uow.run(() => this.accounts.cancelDeletion(userId));
    if (!cancelled.ok) return cancelled;
    return this.accounts.getMe(userId);
  }
}

const valueOrNull = <T>(result: Result<T, DomainError>): T | null =>
  result.ok ? result.value : null;

/** One document with everything held about the person. Built from each module's own view. */
export class ExportMyDataQuery {
  constructor(
    private readonly accounts: PrivacyAccounts,
    private readonly media: PrivacyMedia,
    private readonly sources: PrivacySources,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<Result<DataExport, DomainError>> {
    const limit = await this.rateLimiter.consume(
      `export:${userId}`,
      EXPORT_LIMIT.perUser,
      EXPORT_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'You have downloaded your data several times today. Try tomorrow.',
          limit.retryAfterSeconds,
        ),
      );
    }
    const account = await this.accounts.exportFacts(userId);
    if (!account) return err(domainError('NOT_FOUND', 'Account not found.'));
    const [
      talentProfile,
      agentProfile,
      agentVerification,
      portfolio,
      shortlist,
      notifications,
      media,
    ] = await Promise.all([
      this.sources.talentProfile(userId),
      this.sources.agentProfile(userId),
      this.sources.agentVerification(userId),
      this.sources.portfolio(userId),
      this.sources.shortlist(userId),
      this.sources.notifications(userId),
      this.media.listForOwner(userId),
    ]);
    return ok({
      exportedAt: this.clock.now().toISOString(),
      account,
      talentProfile: valueOrNull(talentProfile),
      agentProfile: valueOrNull(agentProfile),
      agentVerification: valueOrNull(agentVerification),
      portfolio: valueOrNull(portfolio),
      shortlist,
      notifications,
      media: media.map((file) => ({
        id: file.id,
        purpose: file.purpose,
        kind: file.kind,
        status: file.status,
        urls: file.urls,
        video: file.video,
      })),
    });
  }
}

const ERASURE_BATCH = 50;

/**
 * Scheduled in the worker. Erases accounts whose grace period has ended: files first (at us
 * and at the video provider), then the account row, which takes everything else with it.
 */
export class AccountErasureJob {
  readonly name = 'privacy.account-erasure';
  readonly everySeconds = 3600;

  constructor(
    private readonly accounts: PrivacyAccounts,
    private readonly media: PrivacyMedia,
    private readonly uow: UnitOfWork,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    for (const userId of await this.accounts.dueForDeletion(ERASURE_BATCH)) {
      const files = await this.media.purgeOwnerFiles(userId);
      await this.uow.run(() => this.accounts.erase(userId));
      // The user id is the only identifier logged; it no longer points at anyone.
      this.logger.info({ userId, files }, 'account erased');
    }
  }
}
