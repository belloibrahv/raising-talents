import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  searchTalentsQuerySchema,
  type SearchTalentsQuery,
  type TalentSearchResponse,
} from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { SEARCH, type SearchTalentsHandler } from '../../application/search.use-cases.js';

@Controller('v1/search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(@Inject(SEARCH.Search) private readonly search: SearchTalentsHandler) {}

  @Get('talents')
  async talents(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(searchTalentsQuerySchema)) query: SearchTalentsQuery,
  ): Promise<TalentSearchResponse> {
    return unwrap(await this.search.execute(principal.userId, query));
  }
}
