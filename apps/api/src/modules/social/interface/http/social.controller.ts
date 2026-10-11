import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post as HttpPost,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createCommentSchema,
  cursorQuerySchema,
  feedQuerySchema,
  type Comment,
  type CommentPage,
  type FeedQuery as FeedQueryParams,
  type LikeState,
  type Post,
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
  COMMENTS,
  type AddCommentHandler,
  type DeleteCommentHandler,
  type GetPostQuery,
  type ListCommentsQuery,
} from '../../application/comments.use-cases.js';
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

/** Following talent, liking their work, the feed (ADR-047) and comments (ADR-052). */
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
    @Inject(COMMENTS.GetPost) private readonly onePost: GetPostQuery,
    @Inject(COMMENTS.List) private readonly listComments: ListCommentsQuery,
    @Inject(COMMENTS.Add) private readonly addComment: AddCommentHandler,
    @Inject(COMMENTS.Delete) private readonly deleteComment: DeleteCommentHandler,
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

  @Get('posts/:id')
  async post(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Post> {
    return unwrap(await this.onePost.execute(principal.userId, id));
  }

  @Get('posts/:id/comments')
  async comments(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(cursorQuerySchema)) query: CursorQuery,
  ): Promise<CommentPage> {
    return unwrap(await this.listComments.execute(principal.userId, id, query.cursor));
  }

  @HttpPost('posts/:id/comments')
  async comment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createCommentSchema)) body: z.output<typeof createCommentSchema>,
  ): Promise<Comment> {
    return unwrap(
      await this.addComment.execute({ userId: principal.userId, itemId: id, body: body.body }),
    );
  }

  @Delete('comments/:id')
  @HttpCode(204)
  async removeComment(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.deleteComment.execute(principal.userId, id));
  }
}
