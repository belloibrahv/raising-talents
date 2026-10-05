import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { DiscoveryModule } from '@nestjs/core';
import { pino } from 'pino';
import { AppModule } from '../../src/app.module.js';
import { configureApiApp, createFastifyAdapter } from '../../src/bootstrap/create-api-app.js';
import { loadConfig } from '../../src/config/env.js';
import { ACCOUNTS } from '../../src/modules/accounts/application/accounts.tokens.js';
import { InMemoryAccountRepository } from '../../src/modules/accounts/testing/in-memory-account.repository.js';
import { IDENTITY } from '../../src/modules/identity/application/identity.tokens.js';
import type { ModuleEventHandlers } from '../../src/modules/identity/identity.module.js';
import {
  CapturingEmailSender,
  FakeBreachedPasswordChecker,
  FakePasswordHasher,
  InMemoryCredentialRepository,
  InMemoryEmailChangeRepository,
  InMemoryOneTimeCodeRepository,
  InMemorySessionRepository,
} from '../../src/modules/identity/testing/fakes.js';
import { generateTestSigningKeys } from '../../src/modules/identity/testing/identity-test-harness.js';
import { AGENT } from '../../src/modules/agent-profiles/application/agent-profile.use-cases.js';
import { InMemoryAgentProfileRepository } from '../../src/modules/agent-profiles/testing/in-memory-agent-profile.repository.js';
import { VERIFICATION } from '../../src/modules/agent-profiles/application/verification.use-cases.js';
import { InMemoryVerificationRequestRepository } from '../../src/modules/agent-profiles/testing/in-memory-verification-request.repository.js';
import { MEDIA } from '../../src/modules/media/application/media.use-cases.js';
import {
  FakeImageProcessor,
  InMemoryMediaAssetRepository,
  InMemoryObjectStorage,
} from '../../src/modules/media/testing/fakes.js';
import { FakeVideoProvider } from '../../src/modules/media/testing/fake-video-provider.js';
import { MuxWebhookVerifier } from '../../src/modules/media/infrastructure/mux-video-provider.js';
import { PORTFOLIO } from '../../src/modules/portfolio/application/portfolio.use-cases.js';
import { InMemoryPortfolioRepository } from '../../src/modules/portfolio/testing/in-memory-portfolio.repository.js';
import { SAFETY } from '../../src/modules/safety/application/safety.use-cases.js';
import { InMemoryReportRepository } from '../../src/modules/safety/testing/in-memory-report.repository.js';
import { InMemoryNotificationLog } from '../../src/modules/notifications/testing/in-memory-notification-log.js';
import { NOTIFICATIONS } from '../../src/modules/notifications/application/notifications.js';
import { InMemoryInbox } from '../../src/modules/notifications/testing/in-memory-inbox.js';
import { MESSAGING } from '../../src/modules/messaging/application/messaging.use-cases.js';
import { InMemoryConversationRepository } from '../../src/modules/messaging/testing/in-memory-conversation.repository.js';
import { SHORTLIST } from '../../src/modules/shortlists/application/shortlist.use-cases.js';
import { InMemoryShortlistRepository } from '../../src/modules/shortlists/testing/in-memory-shortlist.repository.js';
import { TALENT } from '../../src/modules/talent-profiles/application/talent-profile.tokens.js';
import { InMemoryTalentProfileRepository } from '../../src/modules/talent-profiles/testing/in-memory-talent-profile.repository.js';
import { TAXONOMY } from '../../src/modules/taxonomy/application/taxonomy.tokens.js';
import { sampleTaxonomySource } from '../../src/modules/taxonomy/testing/sample-taxonomy.js';
import { EventDispatcher } from '../../src/platform/outbox/event-dispatcher.js';
import { PLATFORM } from '../../src/platform/platform.tokens.js';
import { InMemoryRealtime } from '../../src/platform/realtime/realtime.js';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../src/platform/testing/fakes.js';

export const E2E_WEB_ORIGIN = 'https://app.raisingtalents.test';
export const E2E_WEBHOOK_SECRET = 'e2e-mux-webhook-secret';

const toBase64 = (value: string) => Buffer.from(value).toString('base64');

export interface TestApp {
  readonly app: NestFastifyApplication;
  readonly moduleRef: TestingModule;
  readonly events: InMemoryEventRecorder;
  readonly email: CapturingEmailSender;
  readonly talentProfiles: InMemoryTalentProfileRepository;
  readonly agentProfiles: InMemoryAgentProfileRepository;
  readonly realtime: InMemoryRealtime;
  readonly storage: InMemoryObjectStorage;
  readonly mediaAssets: InMemoryMediaAssetRepository;
  readonly video: FakeVideoProvider;
  readonly clock: FixedClock;
  /** Publishes recorded events the way the worker would. */
  deliverEvents(): Promise<void>;
}

/**
 * The real NestJS and Fastify stack (routing, validation, guards, the error filter)
 * with in-memory adapters in place of Postgres, Redis and SMTP.
 */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const keys = await generateTestSigningKeys();
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
    REDIS_URL: 'redis://localhost:6379',
    JWT_PRIVATE_KEY_BASE64: toBase64(keys.privateKeyPem),
    JWT_PUBLIC_KEY_BASE64: toBase64(keys.publicKeyPem),
    JWT_KEY_ID: 'e2e-key',
    VERIFICATION_CODE_PEPPER: 'e2e-pepper-0123456789abcdef0123456789abcdef',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MEDIA_BUCKET: 'raising-talents-media-test',
    MEDIA_CDN_URL: 'https://media.test',
    CONTENT_SCANNER: 'development-allow-all',
    WEB_ORIGINS: E2E_WEB_ORIGIN,
    ...overrides,
  });
  const logger = pino({ level: 'silent' });
  const events = new InMemoryEventRecorder();
  const email = new CapturingEmailSender();
  const talentProfiles = new InMemoryTalentProfileRepository(events);
  const agentProfiles = new InMemoryAgentProfileRepository(events);
  const realtime = new InMemoryRealtime();
  const storage = new InMemoryObjectStorage();
  const mediaAssets = new InMemoryMediaAssetRepository(events);
  const video = new FakeVideoProvider();
  const clock = new FixedClock();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ config, logger }), DiscoveryModule],
  })
    .overrideProvider(PLATFORM.Clock)
    .useValue(clock)
    .overrideProvider(PLATFORM.UnitOfWork)
    .useValue(new InMemoryUnitOfWork())
    .overrideProvider(PLATFORM.EventRecorder)
    .useValue(events)
    .overrideProvider(PLATFORM.RateLimiter)
    .useValue(new InMemoryRateLimiter())
    .overrideProvider(PLATFORM.Realtime)
    .useValue(realtime)
    .overrideProvider(PLATFORM.Redis)
    .useValue({ ping: async () => 'PONG', quit: async () => 'OK' })
    .overrideProvider(ACCOUNTS.Repository)
    .useValue(new InMemoryAccountRepository(events))
    .overrideProvider(IDENTITY.Sessions)
    .useValue(new InMemorySessionRepository())
    .overrideProvider(IDENTITY.Credentials)
    .useValue(new InMemoryCredentialRepository())
    .overrideProvider(IDENTITY.Codes)
    .useValue(new InMemoryOneTimeCodeRepository())
    .overrideProvider(IDENTITY.EmailChanges)
    .useValue(new InMemoryEmailChangeRepository())
    .overrideProvider(IDENTITY.PasswordHasher)
    .useValue(new FakePasswordHasher())
    .overrideProvider(IDENTITY.BreachedPasswords)
    .useValue(new FakeBreachedPasswordChecker())
    .overrideProvider(PLATFORM.EmailSender)
    .useValue(email)
    .overrideProvider(TAXONOMY.Source)
    .useValue(sampleTaxonomySource)
    .overrideProvider(TALENT.Repository)
    .useValue(talentProfiles)
    .overrideProvider(AGENT.Repository)
    .useValue(agentProfiles)
    .overrideProvider(VERIFICATION.Requests)
    .useValue(new InMemoryVerificationRequestRepository(events))
    .overrideProvider(MEDIA.Repository)
    .useValue(mediaAssets)
    .overrideProvider(MEDIA.Storage)
    .useValue(storage)
    .overrideProvider(MEDIA.Processor)
    .useValue(new FakeImageProcessor())
    .overrideProvider(MEDIA.Video)
    .useValue(video)
    .overrideProvider(MEDIA.Signer)
    .useValue(video)
    .overrideProvider(MEDIA.WebhookVerifier)
    .useValue(new MuxWebhookVerifier(E2E_WEBHOOK_SECRET, clock))
    .overrideProvider(PORTFOLIO.Repository)
    .useValue(new InMemoryPortfolioRepository(events))
    .overrideProvider(SAFETY.Reports)
    .useValue(new InMemoryReportRepository())
    .overrideProvider(SHORTLIST.Entries)
    .useValue(new InMemoryShortlistRepository())
    .overrideProvider(MESSAGING.Conversations)
    .useValue(new InMemoryConversationRepository(events))
    .overrideProvider(NOTIFICATIONS.Inbox)
    .useValue(new InMemoryInbox())
    .overrideProvider(NOTIFICATIONS.Log)
    .useValue(new InMemoryNotificationLog())
    .compile();

  const dispatcher = new EventDispatcher();
  for (const token of [
    IDENTITY.EventHandlers,
    MEDIA.EventHandlers,
    TALENT.EventHandlers,
    NOTIFICATIONS.EventHandlers,
  ]) {
    moduleRef.get<ModuleEventHandlers>(token).register(dispatcher);
  }
  const app = configureApiApp(
    moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter(config), {
      rawBody: true,
    }),
    logger,
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return {
    app,
    moduleRef,
    events,
    email,
    talentProfiles,
    agentProfiles,
    realtime,
    storage,
    mediaAssets,
    video,
    clock,
    // Keeps draining, because handlers raise new events (an upload becomes ready, then completes a profile).
    deliverEvents: async () => {
      while (events.events.length > 0) {
        for (const event of events.events.splice(0)) await dispatcher.dispatch(event);
      }
    },
  };
}
