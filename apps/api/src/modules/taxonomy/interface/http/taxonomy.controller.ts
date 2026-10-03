import { Controller, Get, Header, Inject, UseGuards } from '@nestjs/common';
import type { TaxonomyResponse } from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
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
}
