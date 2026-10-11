import {
  COMMENTS_PAGE_SIZE,
  ErrorCode,
  type Comment as CommentView,
  type CommentAuthor,
  type CommentPage,
  type ImageUrls,
  type Post,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { isActiveStaff } from '../../accounts/application/staff.js';
import {
  SocialEvents,
  type Comment,
  type CommentRepository,
  type PostSource,
} from '../domain/social.js';
import {
  SocialErrors,
  type PostAssembler,
  type SocialAccounts,
  type SocialTalents,
} from './social.use-cases.js';

export const COMMENTS = {
  Repository: Symbol('CommentRepository'),
  Authors: Symbol('CommentAuthors'),
  GetPost: Symbol('GetPostQuery'),
  List: Symbol('ListCommentsQuery'),
  Add: Symbol('AddCommentHandler'),
  Delete: Symbol('DeleteCommentHandler'),
  Evidence: Symbol('CommentEvidence'),
} as const;

/** What comments need from agent profiles. Implemented by AgentDirectory. */
export interface CommentAgents {
  publicFace(agentId: string): Promise<{
    agencyName: string;
    avatarUrls: ImageUrls | null;
    verified: boolean;
    listed: boolean;
  } | null>;
}

export const COMMENT_LIMIT = { perUser: 10, windowSeconds: 60 } as const;
/** How many of a person's comments their data export lists. */
const EXPORTED_COMMENTS_MAX = 5000;

export const CommentErrors = {
  membersOnly: () => domainError(ErrorCode.Forbidden, 'Only talent and agents can comment.'),
  notFound: () => domainError(ErrorCode.NotFound, 'This comment is not available.'),
  notYours: () => domainError(ErrorCode.Forbidden, 'You cannot delete this comment.'),
};

/**
 * Names the people who wrote a page of comments. A talent is shown with their page, an agent
 * with their agency. Someone whose account is no longer in good standing has no name here, so
 * their comments are left out.
 */
export class CommentAuthors {
  constructor(
    private readonly accounts: SocialAccounts,
    private readonly talents: SocialTalents,
    private readonly agents: CommentAgents,
  ) {}

  async describe(authorIds: readonly string[]): Promise<Map<string, CommentAuthor>> {
    const unique = [...new Set(authorIds)];
    const found = await Promise.all(unique.map((id) => this.one(id)));
    return new Map(
      unique.flatMap((id, index): [string, CommentAuthor][] => {
        const author = found[index];
        return author ? [[id, author]] : [];
      }),
    );
  }

  async one(authorId: string): Promise<CommentAuthor | null> {
    const account = await this.accounts.profileContext(authorId);
    if (account?.status !== 'active') return null;
    if (account.role === 'agent') {
      const agent = await this.agents.publicFace(authorId);
      return agent
        ? {
            name: agent.agencyName,
            handle: null,
            agentId: agent.listed ? authorId : null,
            avatarUrls: agent.avatarUrls,
            verified: agent.verified,
          }
        : null;
    }
    const card = await this.talents.cardFor(authorId);
    if (card) {
      return {
        name: card.displayName,
        handle: card.handle,
        agentId: null,
        avatarUrls: card.avatarUrls,
        verified: card.verified,
      };
    }
    // A talent others cannot see yet (email not verified) still has a name, but no page.
    const name = await this.talents.nameOf(authorId);
    return name
      ? { name: name.displayName, handle: null, agentId: null, avatarUrls: null, verified: false }
      : null;
  }
}

/** The post as the viewer may see it, or nothing: the same rules as the feed. */
async function visiblePost(
  posts: PostSource,
  assembler: PostAssembler,
  itemId: string,
  viewerId: string,
): Promise<{ post: Post; ownerId: string } | null> {
  const row = await posts.find(itemId);
  const [post] = row ? await assembler.assemble([row], viewerId) : [];
  return row && post ? { post, ownerId: row.talentId } : null;
}

async function ensureSignedUp(
  accounts: SocialAccounts,
  userId: string,
): Promise<Result<{ staff: boolean }, DomainError>> {
  const account = await accounts.profileContext(userId);
  if (!account?.role || account.status !== 'active') return err(SocialErrors.notActive());
  return ok({ staff: isActiveStaff(account) });
}

/** One post on its own, for the page a notice about a comment opens. */
export class GetPostQuery {
  constructor(
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly accounts: SocialAccounts,
  ) {}

  async execute(viewerId: string, itemId: string): Promise<Result<Post, DomainError>> {
    const viewer = await ensureSignedUp(this.accounts, viewerId);
    if (!viewer.ok) return viewer;
    const found = await visiblePost(this.posts, this.assembler, itemId, viewerId);
    return found ? ok(found.post) : err(SocialErrors.postNotFound());
  }
}

const toView = (
  comment: Comment,
  author: CommentAuthor,
  viewer: { id: string; staff: boolean; ownsPost: boolean },
): CommentView => {
  const mine = comment.authorId === viewer.id;
  return {
    id: comment.id,
    body: comment.body,
    postedAt: comment.createdAt.toISOString(),
    author,
    mine,
    canDelete: mine || viewer.ownsPost || viewer.staff,
  };
};

export class ListCommentsQuery {
  constructor(
    private readonly comments: CommentRepository,
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly authors: CommentAuthors,
    private readonly accounts: SocialAccounts,
  ) {}

  async execute(
    viewerId: string,
    itemId: string,
    cursor?: string,
  ): Promise<Result<CommentPage, DomainError>> {
    const viewer = await ensureSignedUp(this.accounts, viewerId);
    if (!viewer.ok) return viewer;
    const found = await visiblePost(this.posts, this.assembler, itemId, viewerId);
    if (!found) return err(SocialErrors.postNotFound());

    const after = decodeCursor(cursor);
    const rows = await this.comments.page(
      itemId,
      after ? { createdAt: after.at, id: after.id } : null,
      COMMENTS_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, COMMENTS_PAGE_SIZE);
    const authors = await this.authors.describe(page.map((row) => row.authorId));
    const who = { id: viewerId, staff: viewer.value.staff, ownsPost: found.ownerId === viewerId };
    const last = page.at(-1);
    return ok({
      items: page.flatMap((row) => {
        const author = authors.get(row.authorId);
        return author ? [toView(row, author, who)] : [];
      }),
      nextCursor:
        rows.length > COMMENTS_PAGE_SIZE && last ? encodeCursor(last.createdAt, last.id) : null,
      total: found.post.comments,
    });
  }
}

export class AddCommentHandler {
  constructor(
    private readonly comments: CommentRepository,
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly authors: CommentAuthors,
    private readonly accounts: SocialAccounts,
    private readonly events: EventRecorder,
    private readonly uow: UnitOfWork,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    userId: string;
    itemId: string;
    body: string;
  }): Promise<Result<CommentView, DomainError>> {
    const account = await this.accounts.profileContext(input.userId);
    if (!account?.role || account.status !== 'active') return err(SocialErrors.notActive());
    // Moderators take comments down; they do not join in.
    if (account.role !== 'talent' && account.role !== 'agent') {
      return err(CommentErrors.membersOnly());
    }
    const author = await this.authors.one(input.userId);
    if (!author) return err(SocialErrors.notActive());
    const found = await visiblePost(this.posts, this.assembler, input.itemId, input.userId);
    if (!found) return err(SocialErrors.postNotFound());
    const limit = await this.rateLimiter.consume(
      `comment:${input.userId}`,
      COMMENT_LIMIT.perUser,
      COMMENT_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(SocialErrors.tooFast(limit.retryAfterSeconds));

    const comment: Comment = {
      id: newId(),
      itemId: input.itemId,
      authorId: input.userId,
      body: input.body,
      createdAt: this.clock.now(),
    };
    const ownsPost = found.ownerId === input.userId;
    // The comment and its event are saved together, so the owner is told exactly once.
    await this.uow.run(async () => {
      await this.comments.add(comment);
      if (!ownsPost) {
        await this.events.record([
          {
            type: SocialEvents.PostCommented,
            aggregateId: found.ownerId,
            occurredAt: comment.createdAt,
            payload: {
              commentId: comment.id,
              postId: input.itemId,
              commenterId: input.userId,
              commenterName: author.name,
            },
          },
        ]);
      }
    });
    return ok(toView(comment, author, { id: input.userId, staff: false, ownsPost }));
  }
}

/** The author, the talent whose post it is, or a moderator. */
export class DeleteCommentHandler {
  constructor(
    private readonly comments: CommentRepository,
    private readonly posts: PostSource,
    private readonly accounts: SocialAccounts,
  ) {}

  async execute(userId: string, commentId: string): Promise<Result<void, DomainError>> {
    const comment = await this.comments.find(commentId);
    if (!comment) return err(CommentErrors.notFound());
    if (comment.authorId !== userId) {
      const [post, account] = await Promise.all([
        this.posts.find(comment.itemId),
        this.accounts.profileContext(userId),
      ]);
      if (post?.talentId !== userId && !isActiveStaff(account)) {
        return err(CommentErrors.notYours());
      }
    }
    await this.comments.remove(commentId);
    return ok(undefined);
  }
}

/** What a report about a comment keeps: who wrote it and the words (ADR-052). */
export class CommentEvidence {
  constructor(private readonly comments: CommentRepository) {}

  async forReport(
    commentId: string,
  ): Promise<{ authorId: string; body: string; postedAt: Date } | null> {
    const comment = await this.comments.find(commentId);
    return comment
      ? { authorId: comment.authorId, body: comment.body, postedAt: comment.createdAt }
      : null;
  }

  /** What one person wrote, for their data export (ADR-027). */
  async writtenBy(userId: string): Promise<{ body: string; postedAt: string }[]> {
    const rows = await this.comments.byAuthor(userId, EXPORTED_COMMENTS_MAX);
    return rows.map((row) => ({ body: row.body, postedAt: row.createdAt.toISOString() }));
  }
}
