import { Module, type DynamicModule } from '@nestjs/common';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { AgentProfilesModule } from './modules/agent-profiles/agent-profiles.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { PortfolioModule } from './modules/portfolio/portfolio.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PrivacyModule } from './modules/privacy/privacy.module.js';
import { SafetyModule } from './modules/safety/safety.module.js';
import { ShortlistsModule } from './modules/shortlists/shortlists.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TalentProfilesModule } from './modules/talent-profiles/talent-profiles.module.js';
import { TaxonomyModule } from './modules/taxonomy/taxonomy.module.js';
import { PlatformModule, type PlatformOptions } from './platform/platform.module.js';

/** Everything the api process serves. New business modules are added here. */
@Module({})
export class AppModule {
  static register(options: PlatformOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        PlatformModule.forRoot(options),
        AccountsModule,
        IdentityModule,
        TaxonomyModule,
        TalentProfilesModule,
        AgentProfilesModule,
        MediaModule,
        PortfolioModule,
        SearchModule,
        MessagingModule,
        NotificationsModule,
        PrivacyModule,
        SafetyModule,
        ShortlistsModule,
      ],
    };
  }
}
