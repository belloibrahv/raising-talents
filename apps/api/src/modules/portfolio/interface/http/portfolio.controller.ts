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
  reorderPortfolioRequestSchema,
  updatePortfolioItemRequestSchema,
  type AddPortfolioItemRequest,
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
