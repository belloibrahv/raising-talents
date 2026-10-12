import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  addPortfolioItemRequestSchema,
  addTextPostRequestSchema,
  reorderPortfolioRequestSchema,
  updatePortfolioItemRequestSchema,
  type AddPortfolioItemRequest,
  type AddTextPostRequest,
  type MyPortfolio,
  type PublicPortfolio,
  type ReorderPortfolioRequest,
  type UpdatePortfolioItemRequest,
} from '@rt/contracts';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { formatEtag, parseIfMatch } from '../../../../platform/http/etag.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import {
  PORTFOLIO,
  type AddPortfolioItemHandler,
  type AddTextPostHandler,
  type RemoveTextPostHandler,
  type GetMyPortfolioQuery,
  type GetPublicPortfolioQuery,
  type RemovePortfolioItemHandler,
  type ReorderPortfolioHandler,
  type UpdatePortfolioItemHandler,
} from '../../application/portfolio.use-cases.js';

/** Every owner response carries the version as an ETag, ready for the next reorder. */
const withEtag = (reply: FastifyReply, portfolio: MyPortfolio): MyPortfolio => {
  void reply.header('ETag', formatEtag(portfolio.version));
  return portfolio;
};

@Controller('v1')
@UseGuards(AuthGuard)
export class PortfolioController {
  constructor(
    @Inject(PORTFOLIO.GetMine) private readonly getMine: GetMyPortfolioQuery,
    @Inject(PORTFOLIO.Add) private readonly add: AddPortfolioItemHandler,
    @Inject(PORTFOLIO.AddText) private readonly addTextPost: AddTextPostHandler,
    @Inject(PORTFOLIO.RemoveText) private readonly removeTextPost: RemoveTextPostHandler,
    @Inject(PORTFOLIO.Update) private readonly update: UpdatePortfolioItemHandler,
    @Inject(PORTFOLIO.Remove) private readonly remove: RemovePortfolioItemHandler,
    @Inject(PORTFOLIO.Reorder) private readonly reorder: ReorderPortfolioHandler,
    @Inject(PORTFOLIO.GetPublic) private readonly getPublic: GetPublicPortfolioQuery,
  ) {}

  @Get('me/portfolio')
  async mine(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(reply, unwrap(await this.getMine.execute(principal.userId)));
  }

  @Post('me/portfolio/texts')
  @HttpCode(201)
  async addText(
    @CurrentPrincipal() principal: Principal,
    @Body(body(addTextPostRequestSchema)) request: AddTextPostRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(
      reply,
      unwrap(await this.addTextPost.execute({ userId: principal.userId, text: request.text })),
    );
  }

  /** Moderators only. Posts with a file are taken down through their media (ADR-048). */
  @Post('moderation/posts/:id/removal')
  @HttpCode(204)
  async removeText(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    unwrap(await this.removeTextPost.execute({ moderatorId: principal.userId, itemId: id }));
  }

  @Post('me/portfolio/items')
  @HttpCode(201)
  async addItem(
    @CurrentPrincipal() principal: Principal,
    @Body(body(addPortfolioItemRequestSchema)) request: AddPortfolioItemRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(
      reply,
      unwrap(await this.add.execute({ userId: principal.userId, ...request })),
    );
  }

  @Patch('me/portfolio/items/:itemId')
  async updateItem(
    @CurrentPrincipal() principal: Principal,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(body(updatePortfolioItemRequestSchema)) request: UpdatePortfolioItemRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(
      reply,
      unwrap(
        await this.update.execute({ userId: principal.userId, itemId, caption: request.caption }),
      ),
    );
  }

  @Delete('me/portfolio/items/:itemId')
  async removeItem(
    @CurrentPrincipal() principal: Principal,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(reply, unwrap(await this.remove.execute({ userId: principal.userId, itemId })));
  }

  @Put('me/portfolio/order')
  async putOrder(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(body(reorderPortfolioRequestSchema)) request: ReorderPortfolioRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyPortfolio> {
    return withEtag(
      reply,
      unwrap(
        await this.reorder.execute({
          userId: principal.userId,
          expectedVersion: parseIfMatch(ifMatch),
          itemIds: request.itemIds,
        }),
      ),
    );
  }

  @Get('talents/:handle/portfolio')
  async byHandle(@Param('handle') handle: string): Promise<PublicPortfolio> {
    return unwrap(await this.getPublic.execute(handle));
  }
}
