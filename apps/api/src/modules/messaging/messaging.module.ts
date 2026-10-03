import { Module } from '@nestjs/common';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AgentProfilesModule } from '../agent-profiles/agent-profiles.module.js';
import {
  AGENT,
  type AgentDirectory,
} from '../agent-profiles/application/agent-profile.use-cases.js';
import type { TalentDirectory } from '../talent-profiles/application/get-talent-profile.queries.js';
import { TALENT } from '../talent-profiles/application/talent-profile.tokens.js';
import { TalentProfilesModule } from '../talent-profiles/talent-profiles.module.js';
import {
  ContactNotices,
  ConversationEvidence,
  ConversationViews,
  ConversationWithTalentQuery,
  GetConversationQuery,
  ListConversationsQuery,
  ListMessagesQuery,
  MarkConversationReadHandler,
  MESSAGING,
  MessagingExport,
  MessagingUnreadQuery,
  RequestContactHandler,
  RespondToContactHandler,
  SendMessageHandler,
  WithdrawContactHandler,
} from './application/messaging.use-cases.js';
import type { ConversationRepository } from './domain/conversation.js';
import { DrizzleConversationRepository } from './infrastructure/drizzle-conversation.repository.js';
import { MessagingController } from './interface/http/messaging.controller.js';

const Views = Symbol('ConversationViews');

/** Contact requests from verified agents, and the chat that opens when talent accept (ADR-038). */
@Module({
  imports: [AccountsModule, TalentProfilesModule, AgentProfilesModule],
  controllers: [MessagingController],
  providers: [
    {
      provide: MESSAGING.Conversations,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleConversationRepository(uow, events),
    },
    {
      provide: Views,
      inject: [MESSAGING.Conversations, ACCOUNTS.Facade, TALENT.Directory, AGENT.Directory],
      useFactory: (
        conversations: ConversationRepository,
        accounts: AccountsFacade,
        talents: TalentDirectory,
        agents: AgentDirectory,
      ) => new ConversationViews(conversations, accounts, talents, agents),
    },
    {
      provide: MESSAGING.RequestContact,
      inject: [
        MESSAGING.Conversations,
        Views,
        ACCOUNTS.Facade,
        TALENT.Directory,
        AGENT.Directory,
        PLATFORM.RateLimiter,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        accounts: AccountsFacade,
        talents: TalentDirectory,
        agents: AgentDirectory,
        limiter: RateLimiter,
        uow: UnitOfWork,
        clock: Clock,
      ) =>
        new RequestContactHandler(
          conversations,
          views,
          accounts,
          talents,
          agents,
          limiter,
          uow,
          clock,
        ),
    },
    {
      provide: MESSAGING.WithTalent,
      inject: [MESSAGING.Conversations, Views, ACCOUNTS.Facade, TALENT.Directory],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        accounts: AccountsFacade,
        talents: TalentDirectory,
      ) => new ConversationWithTalentQuery(conversations, views, accounts, talents),
    },
    {
      provide: MESSAGING.List,
      inject: [MESSAGING.Conversations, Views, ACCOUNTS.Facade],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        accounts: AccountsFacade,
      ) => new ListConversationsQuery(conversations, views, accounts),
    },
    {
      provide: MESSAGING.Get,
      inject: [Views],
      useFactory: (views: ConversationViews) => new GetConversationQuery(views),
    },
    {
      provide: MESSAGING.Messages,
      inject: [MESSAGING.Conversations, Views],
      useFactory: (conversations: ConversationRepository, views: ConversationViews) =>
        new ListMessagesQuery(conversations, views),
    },
    {
      provide: MESSAGING.Send,
      inject: [
        MESSAGING.Conversations,
        Views,
        PLATFORM.RateLimiter,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        limiter: RateLimiter,
        uow: UnitOfWork,
        clock: Clock,
      ) => new SendMessageHandler(conversations, views, limiter, uow, clock),
    },
    {
      provide: MESSAGING.Respond,
      inject: [MESSAGING.Conversations, Views, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        uow: UnitOfWork,
        clock: Clock,
      ) => new RespondToContactHandler(conversations, views, uow, clock),
    },
    {
      provide: MESSAGING.Withdraw,
      inject: [MESSAGING.Conversations, Views, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        uow: UnitOfWork,
        clock: Clock,
      ) => new WithdrawContactHandler(conversations, views, uow, clock),
    },
    {
      provide: MESSAGING.MarkRead,
      inject: [MESSAGING.Conversations, Views, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        conversations: ConversationRepository,
        views: ConversationViews,
        uow: UnitOfWork,
        clock: Clock,
      ) => new MarkConversationReadHandler(conversations, views, uow, clock),
    },
    {
      provide: MESSAGING.Unread,
      inject: [MESSAGING.Conversations],
      useFactory: (conversations: ConversationRepository) =>
        new MessagingUnreadQuery(conversations),
    },
    {
      provide: MESSAGING.Export,
      inject: [MESSAGING.Conversations, Views],
      useFactory: (conversations: ConversationRepository, views: ConversationViews) =>
        new MessagingExport(conversations, views),
    },
    {
      provide: MESSAGING.Notices,
      inject: [MESSAGING.Conversations, Views],
      useFactory: (conversations: ConversationRepository, views: ConversationViews) =>
        new ContactNotices(conversations, views),
    },
    {
      provide: MESSAGING.Evidence,
      inject: [MESSAGING.Conversations],
      useFactory: (conversations: ConversationRepository) =>
        new ConversationEvidence(conversations),
    },
  ],
  exports: [MESSAGING.Export, MESSAGING.Notices, MESSAGING.Evidence],
})
export class MessagingModule {}
