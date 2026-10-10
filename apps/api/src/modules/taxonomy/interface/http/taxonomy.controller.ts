import { Controller, Get, Header, Inject, Param, UseGuards } from '@nestjs/common';
import { ErrorCode, type CountryCitiesResponse, type TaxonomyResponse } from '@rt/contracts';
import { domainError } from '../../../../platform/domain-error.js';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { err, ok } from '../../../../platform/result.js';
import { TAXONOMY } from '../../application/taxonomy.tokens.js';
import type { TaxonomySource } from '../../application/taxonomy-catalog.js';

@Controller('v1/taxonomy')
@UseGuards(AuthGuard)
export class TaxonomyController {
  constructor(@Inject(TAXONOMY.Source) private readonly source: TaxonomySource) {}

  @Get()
  // Lists change only with a release, so the app may keep them for an hour.
  @Header('Cache-Control', 'private, max-age=3600')
  async list(): Promise<TaxonomyResponse> {
    return (await this.source.current()).toResponse();
  }

  @Get('countries/:code/cities')
  @Header('Cache-Control', 'private, max-age=3600')
  async cities(@Param('code') code: string): Promise<CountryCitiesResponse> {
    const items = (await this.source.current()).citiesIn(code.toUpperCase());
    return unwrap(
      items === null
        ? err(domainError(ErrorCode.NotFound, 'There is no such country.'))
        : ok({ items: [...items] }),
    );
  }
}
