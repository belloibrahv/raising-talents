import { Module, type Provider } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AgentProfilesModule } from '../agent-profiles/agent-profiles.module.js';
import {
  AGENT,
  type AgentDirectory,
} from '../agent-profiles/application/agent-profile.use-cases.js';
import type { MediaFacade } from '../media/application/media.facade.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaModule } from '../media/media.module.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import {
  AddCommentHandler,
  CommentAuthors,
  CommentEvidence,
  COMMENTS,
  DeleteCommentHandler,
  GetPostQuery,
  ListCommentsQuery,
} from './application/comments.use-cases.js';
import {
  FeedQuery,
  FollowingQuery,
  FollowTalentHandler,
  LikePostHandler,
  PostAssembler,
  SOCIAL,
  SocialExport,
  SuggestionsQuery,
  TalentPostsQuery,
  TalentSocialQuery,
  UnfollowTalentHandler,
  UnlikePostHandler,
} from './application/social.use-cases.js';
import type {
  CommentRepository,
  FollowRepository,
  LikeRepository,
  PostSource,
} from './domain/social.js';
import {
  DrizzleCommentRepository,
  DrizzleFollowRepository,
  DrizzleLikeRepository,
  DrizzlePostSource,
} from './infrastructure/drizzle-social.repositories.js';
import { SocialController } from './interface/http/social.controller.js';

const ASSEMBLER = Symbol('PostAssembler');

const providers: Provider[] = [
  {
    provide: SOCIAL.Follows,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleFollowRepository(uow),
  },
  {
    provide: SOCIAL.Likes,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleLikeRepository(uow),
  },
  {
    provide: SOCIAL.Posts,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzlePostSource(uow),
  },
  {
    provide: ASSEMBLER,
    inject: [TALENT.Directory, MEDIA.Facade, SOCIAL.Likes, COMMENTS.Repository],
    useFactory: (
      talents: TalentDirectory,
      media: MediaFacade,
      likes: LikeRepository,
      comments: CommentRepository,
    ) => new PostAssembler(talents, media, likes, comments),
  },
  {
    provide: COMMENTS.Repository,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleCommentRepository(uow),
  },
  {
    provide: COMMENTS.Authors,
    inject: [ACCOUNTS.Facade, TALENT.Directory, AGENT.Directory],
    useFactory: (accounts: AccountsFacade, talents: TalentDirectory, agents: AgentDirectory) =>
      new CommentAuthors(accounts, talents, agents),
  },
  {
    provide: COMMENTS.GetPost,
    inject: [SOCIAL.Posts, ASSEMBLER, ACCOUNTS.Facade],
    useFactory: (posts: PostSource, assembler: PostAssembler, accounts: AccountsFacade) =>
      new GetPostQuery(posts, assembler, accounts),
  },
  {
    provide: COMMENTS.List,
    inject: [COMMENTS.Repository, SOCIAL.Posts, ASSEMBLER, COMMENTS.Authors, ACCOUNTS.Facade],
    useFactory: (
      comments: CommentRepository,
      posts: PostSource,
      assembler: PostAssembler,
      authors: CommentAuthors,
      accounts: AccountsFacade,
    ) => new ListCommentsQuery(comments, posts, assembler, authors, accounts),
  },
  {
    provide: COMMENTS.Add,
    inject: [
      COMMENTS.Repository,
      SOCIAL.Posts,
      ASSEMBLER,
      COMMENTS.Authors,
      ACCOUNTS.Facade,
      PLATFORM.EventRecorder,
      PLATFORM.UnitOfWork,
      PLATFORM.RateLimiter,
      PLATFORM.Clock,
    ],
    useFactory: (
      comments: CommentRepository,
      posts: PostSource,
      assembler: PostAssembler,
      authors: CommentAuthors,
      accounts: AccountsFacade,
      events: EventRecorder,
      uow: UnitOfWork,
      rateLimiter: RateLimiter,
      clock: Clock,
    ) =>
      new AddCommentHandler(
        comments,
        posts,
        assembler,
        authors,
        accounts,
        events,
        uow,
        rateLimiter,
        clock,
      ),
  },
  {
    provide: COMMENTS.Delete,
    inject: [COMMENTS.Repository, SOCIAL.Posts, ACCOUNTS.Facade],
    useFactory: (comments: CommentRepository, posts: PostSource, accounts: AccountsFacade) =>
      new DeleteCommentHandler(comments, posts, accounts),
  },
  {
    provide: COMMENTS.Evidence,
    inject: [COMMENTS.Repository],
    useFactory: (comments: CommentRepository) => new CommentEvidence(comments),
  },
  {
    provide: SOCIAL.Feed,
    inject: [SOCIAL.Posts, ASSEMBLER, ACCOUNTS.Facade],
    useFactory: (posts: PostSource, assembler: PostAssembler, accounts: AccountsFacade) =>
      new FeedQuery(posts, assembler, accounts),
  },
  {
    provide: SOCIAL.TalentPosts,
    inject: [SOCIAL.Posts, ASSEMBLER, TALENT.Directory],
    useFactory: (posts: PostSource, assembler: PostAssembler, talents: TalentDirectory) =>
      new TalentPostsQuery(posts, assembler, talents),
  },
  {
    provide: SOCIAL.TalentSocial,
    inject: [SOCIAL.Follows, SOCIAL.Posts, TALENT.Directory],
    useFactory: (follows: FollowRepository, posts: PostSource, talents: TalentDirectory) =>
      new TalentSocialQuery(follows, posts, talents),
  },
  {
    provide: SOCIAL.Suggestions,
    inject: [SOCIAL.Posts, TALENT.Directory, ACCOUNTS.Facade],
    useFactory: (posts: PostSource, talents: TalentDirectory, accounts: AccountsFacade) =>
      new SuggestionsQuery(posts, talents, accounts),
  },
  {
    provide: SOCIAL.Following,
    inject: [SOCIAL.Follows, TALENT.Directory],
    useFactory: (follows: FollowRepository, talents: TalentDirectory) =>
      new FollowingQuery(follows, talents),
  },
  {
    provide: SOCIAL.Follow,
    inject: [
      SOCIAL.Follows,
      SOCIAL.Posts,
      ACCOUNTS.Facade,
      TALENT.Directory,
      AGENT.Directory,
      PLATFORM.EventRecorder,
      PLATFORM.UnitOfWork,
      PLATFORM.RateLimiter,
      PLATFORM.Clock,
    ],
    useFactory: (
      follows: FollowRepository,
      posts: PostSource,
      accounts: AccountsFacade,
      talents: TalentDirectory,
      agents: AgentDirectory,
      events: EventRecorder,
      uow: UnitOfWork,
      rateLimiter: RateLimiter,
      clock: Clock,
    ) =>
      new FollowTalentHandler(
        follows,
        posts,
        accounts,
        talents,
        agents,
        events,
        uow,
        rateLimiter,
        clock,
      ),
  },
  {
    provide: SOCIAL.Unfollow,
    inject: [SOCIAL.Follows, SOCIAL.Posts, TALENT.Directory],
    useFactory: (follows: FollowRepository, posts: PostSource, talents: TalentDirectory) =>
      new UnfollowTalentHandler(follows, posts, talents),
  },
  {
    provide: SOCIAL.Like,
    inject: [
      SOCIAL.Likes,
      SOCIAL.Posts,
      ASSEMBLER,
      ACCOUNTS.Facade,
      PLATFORM.RateLimiter,
      PLATFORM.Clock,
    ],
    useFactory: (
      likes: LikeRepository,
      posts: PostSource,
      assembler: PostAssembler,
      accounts: AccountsFacade,
      rateLimiter: RateLimiter,
      clock: Clock,
    ) => new LikePostHandler(likes, posts, assembler, accounts, rateLimiter, clock),
  },
  {
    provide: SOCIAL.Unlike,
    inject: [SOCIAL.Likes],
    useFactory: (likes: LikeRepository) => new UnlikePostHandler(likes),
  },
  {
    provide: SOCIAL.Export,
    inject: [SOCIAL.Follows, TALENT.Directory],
    useFactory: (follows: FollowRepository, talents: TalentDirectory) =>
      new SocialExport(follows, talents),
  },
];

/** Following talent, liking their work, the feed (ADR-047) and comments (ADR-052). */
@Module({
  imports: [AccountsModule, TalentProfilesModule, AgentProfilesModule, MediaModule],
  controllers: [SocialController],
  providers,
  exports: [SOCIAL.Export, SOCIAL.Posts, COMMENTS.Evidence],
})
export class SocialModule {}
