import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EmailSender } from '../../platform/email/email-sender.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import {
  VERIFICATION,
  type VerificationOutcomes,
} from '../agent-profiles/application/verification.use-cases.js';
import { AgentProfilesModule } from '../agent-profiles/agent-profiles.module.js';
import type { ModuleEventHandlers } from '../identity/identity.module.js';
import type { MediaFacade } from '../media/application/media.facade.js';
import { MEDIA } from '../media/application/media.use-cases.js';
import { MediaEvents } from '../media/domain/media-asset.js';
import { MediaModule } from '../media/media.module.js';
import { VerificationEvents } from '../agent-profiles/domain/verification-request.js';
import { NOTIFICATIONS, Notifier, type NotificationLog } from './application/notifications.js';
import { DrizzleNotificationLog } from './infrastructure/drizzle-notification-log.js';

/** Emails people about decisions made on their behalf. Worker only; it has no HTTP routes. */
@Module({
  imports: [AccountsModule, MediaModule, AgentProfilesModule],
  providers: [
    {
      provide: NOTIFICATIONS.Log,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleNotificationLog(uow),
    },
    {
      provide: NOTIFICATIONS.EventHandlers,
      inject: [
        PLATFORM.EmailSender,
        NOTIFICATIONS.Log,
        ACCOUNTS.Facade,
        MEDIA.Facade,
        VERIFICATION.Outcomes,
        PLATFORM.Config,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        email: EmailSender,
        log: NotificationLog,
        accounts: AccountsFacade,
        media: MediaFacade,
        verifications: VerificationOutcomes,
        config: AppConfig,
        clock: Clock,
        logger: Logger,
      ): ModuleEventHandlers => {
        const notifier = new Notifier(
          email,
          log,
          accounts,
          media,
          verifications,
          config.WEB_APP_URL.replace(/\/$/, ''),
          clock,
          logger,
        );
        return {
          register: (dispatcher) => {
            dispatcher.on(MediaEvents.Ready, (event) => notifier.mediaDecided(event));
            dispatcher.on(MediaEvents.Rejected, (event) => notifier.mediaDecided(event));
            dispatcher.on(VerificationEvents.Approved, (event) =>
              notifier.verificationDecided(event),
            );
            dispatcher.on(VerificationEvents.Declined, (event) =>
              notifier.verificationDecided(event),
            );
          },
        };
      },
    },
  ],
  exports: [NOTIFICATIONS.EventHandlers],
})
export class NotificationsModule {}
