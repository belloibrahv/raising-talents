import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  saveToShortlistSchema,
  shortlistQuerySchema,
  type SaveToShortlist,
  type ShortlistEntry,
  type ShortlistPage,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body, ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  SHORTLIST,
  type GetShortlistEntryQuery,
  type ListShortlistQuery,
  type RemoveFromShortlistHandler,
  type SaveToShortlistHandler,
} from '../../application/shortlist.use-cases.js';

@Controller('v1/me/shortlist')
@UseGuards(AuthGuard)
export class ShortlistController {
  constructor(
    @Inject(SHORTLIST.List) private readonly list: ListShortlistQuery,
    @Inject(SHORTLIST.Get) private readonly getEntry: GetShortlistEntryQuery,
    @Inject(SHORTLIST.Save) private readonly saveEntry: SaveToShortlistHandler,
    @Inject(SHORTLIST.Remove) private readonly removeEntry: RemoveFromShortlistHandler,
  ) {}

  @Get()
  async page(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(shortlistQuerySchema)) query: z.infer<typeof shortlistQuerySchema>,
  ): Promise<ShortlistPage> {
    return unwrap(await this.list.execute(principal.userId, query.cursor));
  }

  @Get(':handle')
  async one(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<ShortlistEntry> {
    return unwrap(await this.getEntry.execute(principal.userId, handle));
  }

  @Put(':handle')
  @HttpCode(200)
  async save(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
    @Body(body(saveToShortlistSchema)) input: SaveToShortlist,
  ): Promise<ShortlistEntry> {
    return unwrap(await this.saveEntry.execute(principal.userId, handle, input));
  }

  @Delete(':handle')
  @HttpCode(204)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('handle') handle: string,
  ): Promise<void> {
    unwrap(await this.removeEntry.execute(principal.userId, handle));
  }
}
