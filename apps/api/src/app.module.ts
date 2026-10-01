import { Module, type DynamicModule } from '@nestjs/common';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { PlatformModule, type PlatformOptions } from './platform/platform.module.js';

/** Everything the api process serves. New business modules are added here. */
@Module({})
export class AppModule {
  static register(options: PlatformOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [PlatformModule.forRoot(options), AccountsModule, IdentityModule],
    };
  }
}
