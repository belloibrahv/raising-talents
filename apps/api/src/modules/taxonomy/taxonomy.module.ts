import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { Database } from '../../platform/database/client.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import { TAXONOMY } from './application/taxonomy.tokens.js';
import { CachedTaxonomySource } from './infrastructure/cached-taxonomy-source.js';
import { TaxonomyController } from './interface/http/taxonomy.controller.js';

@Module({
  controllers: [TaxonomyController],
  providers: [
    {
      provide: TAXONOMY.Source,
      inject: [PLATFORM.Database, PLATFORM.Clock],
      useFactory: (db: Database, clock: Clock) => new CachedTaxonomySource(db, clock),
    },
  ],
  exports: [TAXONOMY.Source],
})
export class TaxonomyModule {}
