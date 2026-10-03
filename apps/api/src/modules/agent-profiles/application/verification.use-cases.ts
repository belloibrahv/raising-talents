import {
  MODERATION_PAGE_SIZE,
  type AccountStatus,
  type MyAgentVerification,
  type Role,
  type VerificationDecision,
  type VerificationQueuePage,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { isActiveStaff } from '../../accounts/application/staff.js';
import type { TaxonomySource } from '../../taxonomy/application/taxonomy-catalog.js';
import {
  AgentProfileErrors,
  type AgentProfile,
  type AgentProfileRepository,
} from '../domain/agent-profile.js';
import {
  DECLINE_REASON,
  PendingVerificationExistsError,
  VerificationErrors,
  VerificationRequest,
  type VerificationRequestRepository,
} from '../domain/verification-request.js';

export const VERIFICATION = {
  Requests: Symbol('VerificationRequestRepository'),
  GetMine: Symbol('GetMyVerificationQuery'),
  Request: Symbol('RequestVerificationHandler'),
  List: Symbol('ListPendingVerificationsQuery'),
  Decide: Symbol('DecideVerificationHandler'),
  Outcomes: Symbol('VerificationOutcomes'),
} as const;

export const VERIFICATION_REQUEST_LIMIT = { perDay: 3, windowSeconds: 86_400 } as const;

/** What verification needs from accounts. Implemented by AccountsFacade. */
export interface VerificationAccounts {
  profileContext(userId: string): Promise<{ role: Role | null; status: AccountStatus } | null>;
  findSummaryById(id: string): Promise<{ email: string } | null>;
}

const notStaff = () => domainError('FORBIDDEN', 'Only moderators can do this.');

function viewFor(
  profile: AgentProfile | null,
  latest: VerificationRequest | null,
): MyAgentVerification {
  const request = latest?.snapshot();
  const state = profile?.isVerified
    ? 'verified'
    : request?.status === 'pending'
      ? 'pending'
      : request?.status === 'declined'
        ? 'declined'
        : 'not_requested';
  return {
    state,
    declineReason:
      state === 'declined' && request?.declineCategory
        ? DECLINE_REASON[request.declineCategory]
        : null,
    submittedAt:
      request && state !== 'not_requested' && state !== 'verified'
        ? request.submittedAt.toISOString()
        : null,
    canRequest: Boolean(profile?.isComplete) && state !== 'verified' && state !== 'pending',
  };
}

/** Read by other modules (notifications) to learn how a request ended. */
export class VerificationOutcomes {
  constructor(private readonly requests: VerificationRequestRepository) {}

  async outcome(requestId: string): Promise<{
    agentId: string;
    status: 'pending' | 'approved' | 'declined';
    declineReason: string | null;
  } | null> {
    const request = await this.requests.findById(requestId);
    if (!request) return null;
    const props = request.snapshot();
    return {
      agentId: props.agentId,
      status: props.status,
      declineReason: props.declineCategory ? DECLINE_REASON[props.declineCategory] : null,
    };
  }
}

export class GetMyVerificationQuery {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly requests: VerificationRequestRepository,
    private readonly accounts: VerificationAccounts,
  ) {}

  async execute(agentId: string): Promise<Result<MyAgentVerification, DomainError>> {
    const account = await this.accounts.profileContext(agentId);
    if (account?.role !== 'agent') return err(AgentProfileErrors.wrongRole());
    const [profile, latest] = await Promise.all([
      this.profiles.findByUserId(agentId),
      this.requests.findLatestForAgent(agentId),
    ]);
    return ok(viewFor(profile, latest));
  }
}

/** An agent asks to be verified, with a page that shows they work for the agency. */
export class RequestVerificationHandler {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly requests: VerificationRequestRepository,
    private readonly accounts: VerificationAccounts,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(
    agentId: string,
    input: {
      evidenceUrl: string;
      registrationNumber?: string | undefined;
      note?: string | undefined;
    },
  ): Promise<Result<MyAgentVerification, DomainError>> {
    const account = await this.accounts.profileContext(agentId);
    if (account?.role !== 'agent') return err(AgentProfileErrors.wrongRole());
    const profile = await this.profiles.findByUserId(agentId);
    if (!profile?.isComplete || account.status !== 'active')
      return err(VerificationErrors.profileIncomplete());
    if (profile.isVerified) return err(VerificationErrors.alreadyVerified());
    if ((await this.requests.findLatestForAgent(agentId))?.status === 'pending') {
      return err(VerificationErrors.pending());
    }
    const limit = await this.rateLimiter.consume(
      `verification-request:${agentId}`,
      VERIFICATION_REQUEST_LIMIT.perDay,
      VERIFICATION_REQUEST_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'You have asked several times today. Try again tomorrow.',
          limit.retryAfterSeconds,
        ),
      );
    }

    const request = VerificationRequest.submit({
      id: newId(),
      agentId,
      evidenceUrl: input.evidenceUrl,
      registrationNumber: input.registrationNumber ?? null,
      note: input.note ?? '',
      now: this.clock.now(),
    });
    try {
      await this.uow.run(() => this.requests.save(request));
    } catch (error) {
      // A second request that raced the first: the database allows one pending per agent.
      if (error instanceof PendingVerificationExistsError) return err(VerificationErrors.pending());
      throw error;
    }
    return ok(viewFor(profile, request));
  }
}

const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');

function decodeCursor(cursor: string | undefined): { submittedAt: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const submittedAt = new Date(iso ?? '');
  return id && !Number.isNaN(submittedAt.getTime()) ? { submittedAt, id } : null;
}

export class ListPendingVerificationsQuery {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly requests: VerificationRequestRepository,
    private readonly accounts: VerificationAccounts,
    private readonly taxonomy: TaxonomySource,
  ) {}

  async execute(
    viewerId: string,
    cursor?: string,
  ): Promise<Result<VerificationQueuePage, DomainError>> {
    if (!isActiveStaff(await this.accounts.profileContext(viewerId))) return err(notStaff());
    const rows = await this.requests.findPending(decodeCursor(cursor), MODERATION_PAGE_SIZE + 1);
    const page = rows.slice(0, MODERATION_PAGE_SIZE);
    const catalog = await this.taxonomy.current();
    const items = await Promise.all(
      page.map(async (request) => {
        const props = request.snapshot();
        const [profile, account, previouslyDeclined] = await Promise.all([
          this.profiles.findByUserId(props.agentId),
          this.accounts.findSummaryById(props.agentId),
          this.requests.countDeclined(props.agentId),
        ]);
        const agent = profile?.snapshot();
        return {
          id: props.id,
          agentId: props.agentId,
          email: account?.email ?? '',
          agencyName: agent?.agencyName ?? '',
          jobTitle: agent?.jobTitle ?? '',
          city: catalog.city(agent?.citySlug ?? null),
          specializations: catalog.categoryRefs(agent?.specializationSlugs ?? []),
          website: agent?.website ?? null,
          evidenceUrl: props.evidenceUrl,
          registrationNumber: props.registrationNumber,
          note: props.note,
          submittedAt: props.submittedAt.toISOString(),
          previouslyDeclined,
        };
      }),
    );
    const last = page.at(-1);
    return ok({
      items,
      nextCursor:
        rows.length > MODERATION_PAGE_SIZE && last
          ? encodeCursor(last.snapshot().submittedAt, last.id)
          : null,
    });
  }
}

/** Approving sets the badge on the profile in the same transaction as the decision. */
export class DecideVerificationHandler {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly requests: VerificationRequestRepository,
    private readonly accounts: VerificationAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: {
    moderatorId: string;
    requestId: string;
    decision: VerificationDecision;
  }): Promise<Result<void, DomainError>> {
    if (!isActiveStaff(await this.accounts.profileContext(input.moderatorId)))
      return err(notStaff());
    const result = await this.uow.run(async () => {
      const now = this.clock.now();
      const request = await this.requests.findById(input.requestId, { lock: true });
      if (!request) return err(VerificationErrors.notFound());
      const decided = request.decide(
        input.decision.decision === 'approve'
          ? { approve: true }
          : { approve: false, category: input.decision.category },
        input.moderatorId,
        now,
      );
      if (!decided.ok) return decided;
      if (input.decision.decision === 'approve') {
        const profile = await this.profiles.findByUserId(request.agentId, { lock: true });
        if (!profile) return err(VerificationErrors.notFound());
        profile.markVerified(now);
        await this.profiles.save(profile);
      }
      await this.requests.save(request);
      return ok(undefined);
    });
    if (result.ok) {
      this.logger.info(
        { moderatorId: input.moderatorId, requestId: input.requestId, decision: input.decision },
        'agent verification decided',
      );
    }
    return result;
  }
}
