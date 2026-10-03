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
import { AccountEvents } from '../accounts/domain/account.events.js';
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
import { MESSAGING, type ContactNotices } from '../messaging/application/messaging.use-cases.js';
import { ConversationEvents } from '../messaging/domain/conversation.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { NOTIFICATIONS, Notifier, type NotificationLog } from './application/notifications.js';
import { DrizzleNotificationLog } from './infrastructure/drizzle-notification-log.js';
import { IdentityEvents } from '../identity/domain/identity.events.js';
import {
  InboxPruneJob,
  ListNotificationsQuery,
  MarkNotificationsReadHandler,
  NotificationsExport,
  UnreadCountQuery,
  type Inbox,
} from './application/inbox.js';
import { DrizzleInbox } from './infrastructure/drizzle-inbox.js';
import { NotificationsController } from './interface/http/notifications.controller.js';

/** Tells people about decisions made on their behalf: by email, and in the app's inbox (ADR-032). */
@Module({
  imports: [AccountsModule, MediaModule, AgentProfilesModule, MessagingModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATIONS.Inbox,
      inject: [PLATFORM.UnitOfWork],
      useFactory: (uow: DrizzleUnitOfWork) => new DrizzleInbox(uow),
    },
    {
      provide: NOTIFICATIONS.List,
      inject: [NOTIFICATIONS.Inbox],
      useFactory: (inbox: Inbox) => new ListNotificationsQuery(inbox),
    },
    {
      provide: NOTIFICATIONS.Unread,
      inject: [NOTIFICATIONS.Inbox],
      useFactory: (inbox: Inbox) => new UnreadCountQuery(inbox),
    },
    {
      provide: NOTIFICATIONS.MarkRead,
      inject: [NOTIFICATIONS.Inbox, PLATFORM.Clock],
      useFactory: (inbox: Inbox, clock: Clock) => new MarkNotificationsReadHandler(inbox, clock),
    },
    {
      provide: NOTIFICATIONS.Export,
      inject: [NOTIFICATIONS.Inbox],
      useFactory: (inbox: Inbox) => new NotificationsExport(inbox),
    },
    {
      provide: NOTIFICATIONS.Prune,
      inject: [NOTIFICATIONS.Inbox, PLATFORM.Clock, PLATFORM.Logger],
      useFactory: (inbox: Inbox, clock: Clock, logger: Logger) =>
        new InboxPruneJob(inbox, clock, logger),
    },
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
        NOTIFICATIONS.Inbox,
        ACCOUNTS.Facade,
        MEDIA.Facade,
        VERIFICATION.Outcomes,
        MESSAGING.Notices,
        PLATFORM.Config,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        email: EmailSender,
        log: NotificationLog,
        inbox: Inbox,
        accounts: AccountsFacade,
        media: MediaFacade,
        verifications: VerificationOutcomes,
        contacts: ContactNotices,
        config: AppConfig,
        clock: Clock,
        logger: Logger,
      ): ModuleEventHandlers => {
        const notifier = new Notifier(
          email,
          log,
          inbox,
          accounts,
          media,
          verifications,
          contacts,
          config.WEB_APP_URL.replace(/\/$/, ''),
          config.SUPPORT_EMAIL,
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
            dispatcher.on(AccountEvents.DeletionRequested, (event) =>
              notifier.deletionScheduled(event),
            );
            dispatcher.on(AccountEvents.AccountSuspended, (event) =>
              notifier.accountRestricted(event, 'suspend'),
            );
            dispatcher.on(AccountEvents.AccountBanned, (event) =>
              notifier.accountRestricted(event, 'ban'),
            );
            dispatcher.on(AccountEvents.AccountReinstated, (event) =>
              notifier.accountReinstated(event),
            );
            dispatcher.on(IdentityEvents.PasswordChanged, (event) =>
              notifier.passwordChanged(event),
            );
            dispatcher.on(AccountEvents.EmailChanged, (event) => notifier.emailChanged(event));
            dispatcher.on(ConversationEvents.ContactRequested, (event) =>
              notifier.contactRequested(event),
            );
            dispatcher.on(ConversationEvents.ContactAccepted, (event) =>
              notifier.contactAnswered(event, true),
            );
            dispatcher.on(ConversationEvents.ContactDeclined, (event) =>
              notifier.contactAnswered(event, false),
            );
          },
        };
      },
    },
  ],
  exports: [NOTIFICATIONS.EventHandlers, NOTIFICATIONS.Export, NOTIFICATIONS.Prune],
})
export class NotificationsModule {}
