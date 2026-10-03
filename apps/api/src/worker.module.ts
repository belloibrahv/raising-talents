import { Module, type DynamicModule } from '@nestjs/common';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TalentProfilesModule } from './modules/talent-profiles/talent-profiles.module.js';
import { PlatformModule, type PlatformOptions } from './platform/platform.module.js';

/** Everything the worker process needs: the same modules, no HTTP server. */
@Module({})
export class WorkerModule {
  static register(options: PlatformOptions): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        PlatformModule.forRoot(options),
        AccountsModule,
        IdentityModule,
        MediaModule,
        TalentProfilesModule,
        SearchModule,
      ],
    };
  }
}
