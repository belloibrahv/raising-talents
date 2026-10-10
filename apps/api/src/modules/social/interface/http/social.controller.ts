import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  cursorQuerySchema,
  feedQuerySchema,
  type FeedQuery as FeedQueryParams,
  type LikeState,
  type PostPage,
  type Suggestions,
  type TalentCardPage,
  type TalentSocial,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  SOCIAL,
  type FeedQuery,
  type FollowingQuery,
  type FollowTalentHandler,
  type LikePostHandler,
  type SuggestionsQuery,
  type TalentPostsQuery,
  type TalentSocialQuery,
  type UnfollowTalentHandler,
  type UnlikePostHandler,
} from '../../application/social.use-cases.js';

type CursorQuery = z.infer<typeof cursorQuerySchema>;

/** Following talent, liking their work, and the feed (ADR-047). */
@Controller('v1')
@UseGuards(AuthGuard)
export class SocialController {
  constructor(
    @Inject(SOCIAL.Feed) private readonly feed: FeedQuery,
    @Inject(SOCIAL.Suggestions) private readonly suggested: SuggestionsQuery,
    @Inject(SOCIAL.TalentPosts) private readonly talentPosts: TalentPostsQuery,
    @Inject(SOCIAL.TalentSocial) private readonly talentSocial: TalentSocialQuery,
    @Inject(SOCIAL.Following) private readonly followingList: FollowingQuery,
    @Inject(SOCIAL.Follow) private readonly followTalent: FollowTalentHandler,
    @Inject(SOCIAL.Unfollow) private readonly unfollowTalent: UnfollowTalentHandler,
    @Inject(SOCIAL.Like) private readonly likePost: LikePostHandler,
    @Inject(SOCIAL.Unlike) private readonly unlikePost: UnlikePostHandler,
  ) {}

  @Get('feed')
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(feedQuerySchema)) query: FeedQueryParams,
  ): Promise<PostPage> {
    return unwrap(await this.feed.execute(principal.userId, query.scope, query.cursor));
  }

  @Get('feed/suggestions')
  async suggestions(@CurrentPrincipal() principal: Principal): Promise<Suggestions> {
    return unwrap(await this.suggested.execute(principal.userId));
  }

  @Get('me/following')
  async following(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<TalentCardPage> {
    return this.followingList.execute(principal.userId, query.cursor);
  }

  @Get('talents/:handle/posts')
  async posts(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<PostPage> {
    return unwrap(await this.talentPosts.execute(principal.userId, handle, query.cursor));
  }

  @Get('talents/:handle/social')
  async social(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<TalentSocial> {
    return unwrap(await this.talentSocial.execute(principal.userId, handle));
  }

  @Put('talents/:handle/follow')
  async follow(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<TalentSocial> {
    return unwrap(await this.followTalent.execute(principal.userId, handle));
  }

  @Delete('talents/:handle/follow')
  async unfollow(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<TalentSocial> {
    return unwrap(await this.unfollowTalent.execute(principal.userId, handle));
  }

  @Put('posts/:id/like')
  async like(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LikeState> {
    return unwrap(await this.likePost.execute(principal.userId, id));
  }

  @Delete('posts/:id/like')
  async unlike(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LikeState> {
    return unwrap(await this.unlikePost.execute(principal.userId, id));
  }
}
