import {
  MODERATION_PAGE_SIZE,
  REPORTED_MEDIA_SHOWN,
  type AccountStatus,
  type CreateReport,
  type ReportCategory,
  type ReportDecision,
  type ReportQueuePage,
  type Role,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { isActiveStaff } from '../../accounts/application/staff.js';
import type { ReportRepository } from '../domain/report.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';

export const SAFETY = {
  Reports: Symbol('ReportRepository'),
  Accounts: Symbol('SafetyAccounts'),
  Talents: Symbol('SafetyTalents'),
  File: Symbol('FileReportHandler'),
  List: Symbol('ListReportedAccountsQuery'),
  Decide: Symbol('DecideReportsHandler'),
  Reinstate: Symbol('ReinstateAccountHandler'),
} as const;

/** How many of an account's reported posts are looked up to find the live ones to show. */
const REPORTED_MEDIA_CHECKED = 30;

export const REPORT_LIMIT = { perDay: 10, windowSeconds: 86_400 } as const;

/** What safety needs from accounts. Implemented by AccountsFacade. */
export interface SafetyAccounts {
  profileContext(userId: string): Promise<{
    role: Role | null;
    status: AccountStatus;
    emailVerified: boolean;
  } | null>;
  restrict(
    userId: string,
    action: 'suspend' | 'ban',
    reason: ReportCategory,
  ): Promise<Result<void, DomainError>>;
  reinstate(email: string): Promise<Result<string, DomainError>>;
  findSummaryByEmail(email: string): Promise<{ id: string } | null>;
}

/** What safety needs from identity. Implemented by IdentityFacade. */
export interface SafetySessions {
  signOutBlocked(userId: string): Promise<void>;
}

/** What safety needs from talent profiles. Implemented by TalentDirectory. */
export interface SafetyTalents {
  /** The talent's user id when the profile is public, otherwise null. */
  visibleUserId(handle: string): Promise<string | null>;
  /** The handle and name while the profile is complete, whatever the account's status. */
  searchable(userId: string): Promise<{ profile: { handle: string; displayName: string } } | null>;
  /** Not null while others can see the talent. */
  cardFor(userId: string): Promise<object | null>;
}

/** What safety needs from messaging. Implemented by ConversationEvidence (ADR-039). */
export interface SafetyConversations {
  /**
   * The other person in a conversation the reporter is part of, with that person's latest
   * messages there. Null when the conversation does not exist or is not the reporter's.
   */
  forReport(
    conversationId: string,
    reporterId: string,
  ): Promise<{ subjectId: string; evidence: { body: string; sentAt: Date }[] } | null>;
}

/** What safety needs from posts. Implemented by the feed's PostSource. */
export interface SafetyPosts {
  find(
    postId: string,
  ): Promise<{ talentId: string; mediaId: string | null; caption: string; postedAt: Date } | null>;
}

/** What safety needs from comments. Implemented by CommentEvidence (ADR-052). */
export interface SafetyComments {
  forReport(commentId: string): Promise<{ authorId: string; body: string; postedAt: Date } | null>;
}

/** What safety needs from media. Implemented by MediaFacade. */
export interface SafetyMedia {
  describe(ids: readonly string[]): Promise<
    Map<
      string,
      {
        kind: 'image' | 'video' | 'audio';
        status: string;
        urls: { medium: string } | null;
        video: { posterUrl: string; streamUrl: string; format: 'hls' | 'file' } | null;
        audio: { url: string } | null;
      }
    >
  >;
}

/** What safety needs from agent profiles. Implemented by AgentDirectory. */
export interface SafetyAgents {
  summaryOf(agentId: string): Promise<{ agencyName: string; verified: boolean } | null>;
}

type ReportEvidenceInput = { body: string; sentAt: Date };

export const SafetyErrors = {
  cannotReport: () => domainError('FORBIDDEN', 'Verify your email before reporting a profile.'),
  ownProfile: () => domainError('FORBIDDEN', 'You cannot report your own profile.'),
  subjectNotFound: () =>
    domainError('NOT_FOUND', 'This profile, post, comment or conversation is not available.'),
  noOpenReports: () =>
    domainError(
      'NOT_FOUND',
      'This account has no open reports. Another moderator may have decided.',
    ),
  notStaff: () => domainError('FORBIDDEN', 'Only moderators can do this.'),
};

/** Who may report: anyone signed in with a verified email whose account is in good standing. */
const canReport = (account: { status: AccountStatus; emailVerified: boolean } | null): boolean =>
  Boolean(account?.emailVerified) &&
  (account?.status === 'active' || account?.status === 'onboarding');

export class FileReportHandler {
  constructor(
    private readonly reports: ReportRepository,
    private readonly accounts: SafetyAccounts,
    private readonly talents: SafetyTalents,
    private readonly conversations: SafetyConversations,
    private readonly posts: SafetyPosts,
    private readonly comments: SafetyComments,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  /** Who a report is about, with what the moderator should be shown. */
  private async subjectOf(
    reporterId: string,
    target: CreateReport['subject'],
  ): Promise<{
    subjectId: string;
    evidence: ReportEvidenceInput[];
    mediaId: string | null;
  } | null> {
    if (target.kind === 'talent') {
      const subjectId = await this.talents.visibleUserId(target.handle);
      return subjectId ? { subjectId, evidence: [], mediaId: null } : null;
    }
    if (target.kind === 'post') {
      const post = await this.posts.find(target.postId);
      // A post nobody else can see answers like a missing one.
      if (!post || !(await this.talents.cardFor(post.talentId))) return null;
      // A text post has no file to show the moderator, so its words are kept instead.
      return post.mediaId === null
        ? {
            subjectId: post.talentId,
            evidence: [{ body: post.caption, sentAt: post.postedAt }],
            mediaId: null,
          }
        : { subjectId: post.talentId, evidence: [], mediaId: post.mediaId };
    }
    if (target.kind === 'comment') {
      const comment = await this.comments.forReport(target.commentId);
      // The words are kept with the report, so they are there if the comment is deleted.
      return comment
        ? {
            subjectId: comment.authorId,
            evidence: [{ body: comment.body, sentAt: comment.postedAt }],
            mediaId: null,
          }
        : null;
    }
    const found = await this.conversations.forReport(target.conversationId, reporterId);
    return found ? { ...found, mediaId: null } : null;
  }

  async execute(reporterId: string, input: CreateReport): Promise<Result<void, DomainError>> {
    if (!canReport(await this.accounts.profileContext(reporterId))) {
      return err(SafetyErrors.cannotReport());
    }
    const subject = await this.subjectOf(reporterId, input.subject);
    if (!subject) return err(SafetyErrors.subjectNotFound());
    const { subjectId, evidence, mediaId } = subject;
    if (subjectId === reporterId) return err(SafetyErrors.ownProfile());

    const limit = await this.rateLimiter.consume(
      `report:${reporterId}`,
      REPORT_LIMIT.perDay,
      REPORT_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError(
          'RATE_LIMITED',
          'You have sent a lot of reports today. Try again tomorrow.',
          limit.retryAfterSeconds,
        ),
      );
    }

    // A second report from the same person adds nothing, and they are not told either way.
    await this.reports.add({
      id: newId(),
      reporterId,
      subjectId,
      category: input.category,
      note: input.note ?? '',
      evidence,
      mediaId,
      status: 'open',
      createdAt: this.clock.now(),
      closedAt: null,
      closedBy: null,
    });
    return ok(undefined);
  }
}

const pageAfter = (cursor: string | undefined) => {
  const after = decodeCursor(cursor);
  return after ? { firstReportedAt: after.at, subjectId: after.id } : null;
};

export class ListReportedAccountsQuery {
  constructor(
    private readonly reports: ReportRepository,
    private readonly accounts: SafetyAccounts,
    private readonly talents: SafetyTalents,
    private readonly agents: SafetyAgents,
    private readonly media: SafetyMedia,
  ) {}

  async execute(viewerId: string, cursor?: string): Promise<Result<ReportQueuePage, DomainError>> {
    if (!isActiveStaff(await this.accounts.profileContext(viewerId))) {
      return err(SafetyErrors.notStaff());
    }
    const rows = await this.reports.openSubjects(pageAfter(cursor), MODERATION_PAGE_SIZE + 1);
    const page = rows.slice(0, MODERATION_PAGE_SIZE);
    // One read for every reported post on the page. Posts already taken down are left out
    // before the limit is applied, so a live one is never hidden behind removed ones.
    const files = await this.media.describe(
      page.flatMap((subject) =>
        subject.media.slice(0, REPORTED_MEDIA_CHECKED).map((entry) => entry.mediaId),
      ),
    );
    const items = await Promise.all(
      page.map(async (subject) => {
        const [account, talent, agent, previousActions] = await Promise.all([
          this.accounts.profileContext(subject.subjectId),
          this.talents.searchable(subject.subjectId),
          this.agents.summaryOf(subject.subjectId),
          this.reports.countRestrictions(subject.subjectId),
        ]);
        return {
          accountId: subject.subjectId,
          role: account?.role ?? null,
          status: account?.status ?? ('active' as const),
          talent: talent
            ? { handle: talent.profile.handle, displayName: talent.profile.displayName }
            : null,
          agent: agent ? { agencyName: agent.agencyName, verified: agent.verified } : null,
          reportedMedia: subject.media
            .slice(0, REPORTED_MEDIA_CHECKED)
            .flatMap((entry) => {
              const file = files.get(entry.mediaId);
              const previewUrl = file?.urls?.medium ?? file?.video?.posterUrl ?? file?.audio?.url;
              // A recording, or a video kept as a file, has no picture: it is played instead.
              const playUrl =
                file?.audio?.url ?? (file?.video?.format === 'file' ? file.video.streamUrl : null);
              return file?.status === 'ready' && previewUrl
                ? [
                    {
                      mediaId: entry.mediaId,
                      reports: entry.count,
                      previewUrl,
                      kind: file.kind,
                      playUrl,
                    },
                  ]
                : [];
            })
            .slice(0, REPORTED_MEDIA_SHOWN),
          openReports: subject.total,
          categories: [...subject.categories],
          notes: subject.notes.map((entry) => ({
            note: entry.note,
            reportedAt: entry.reportedAt.toISOString(),
          })),
          evidence: subject.evidence.map((entry) => ({
            body: entry.body,
            sentAt: entry.sentAt.toISOString(),
          })),
          firstReportedAt: subject.firstReportedAt.toISOString(),
          previousActions,
        };
      }),
    );
    const last = page.at(-1);
    return ok({
      items,
      nextCursor:
        rows.length > MODERATION_PAGE_SIZE && last
          ? encodeCursor(last.firstReportedAt, last.subjectId)
          : null,
    });
  }
}

/**
 * Closes the account's open reports and, unless dismissed, suspends or bans it and ends its
 * sessions, all in one transaction. Closing first means a second moderator deciding at the same moment waits on
 * the same rows, then finds nothing open and changes nothing.
 */
export class DecideReportsHandler {
  constructor(
    private readonly reports: ReportRepository,
    private readonly accounts: SafetyAccounts,
    private readonly sessions: SafetySessions,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(input: {
    moderatorId: string;
    accountId: string;
    decision: ReportDecision;
  }): Promise<Result<void, DomainError>> {
    if (!isActiveStaff(await this.accounts.profileContext(input.moderatorId))) {
      return err(SafetyErrors.notStaff());
    }
    const { decision } = input;
    const result = await this.uow.run(async (): Promise<Result<void, DomainError>> => {
      const now = this.clock.now();
      const closed = await this.reports.closeOpen(
        input.accountId,
        decision.decision === 'dismiss' ? 'dismissed' : 'actioned',
        input.moderatorId,
        now,
      );
      if (closed === 0) return err(SafetyErrors.noOpenReports());
      if (decision.decision === 'dismiss') return ok(undefined);

      const restricted = await this.accounts.restrict(
        input.accountId,
        decision.decision,
        decision.reason,
      );
      if (!restricted.ok) return restricted;
      await this.sessions.signOutBlocked(input.accountId);
      await this.reports.recordAction({
        id: newId(),
        accountId: input.accountId,
        action: decision.decision,
        reason: decision.reason,
        actorId: input.moderatorId,
        createdAt: now,
      });
      return ok(undefined);
    });
    if (result.ok) {
      this.logger.info(
        { moderatorId: input.moderatorId, accountId: input.accountId, decision },
        'reports decided',
      );
    }
    return result;
  }
}

/** Lifts a suspension or ban. Run by an operator from the command line, never from the app. */
export class ReinstateAccountHandler {
  constructor(
    private readonly reports: ReportRepository,
    private readonly accounts: SafetyAccounts,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    email: string;
    operatorEmail: string;
  }): Promise<Result<string, DomainError>> {
    const operator = await this.accounts.findSummaryByEmail(input.operatorEmail);
    if (!operator || !isActiveStaff(await this.accounts.profileContext(operator.id))) {
      return err(SafetyErrors.notStaff());
    }
    return this.uow.run(async (): Promise<Result<string, DomainError>> => {
      const reinstated = await this.accounts.reinstate(input.email);
      if (!reinstated.ok) return reinstated;
      await this.reports.recordAction({
        id: newId(),
        accountId: reinstated.value,
        action: 'reinstate',
        reason: null,
        actorId: operator.id,
        createdAt: this.clock.now(),
      });
      return reinstated;
    });
  }
}
