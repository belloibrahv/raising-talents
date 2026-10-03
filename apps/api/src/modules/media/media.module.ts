import { RekognitionClient } from '@aws-sdk/client-rekognition';
import { S3Client } from '@aws-sdk/client-s3';
import { Module } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import type { ModuleEventHandlers } from '../identity/identity.module.js';
import { MediaFacade, RemoveDeletedMediaHandler } from './application/media.facade.js';
import { MediaPresenter } from './application/media-presenter.js';
import { MediaUrls } from './application/media-urls.js';
import {
  AbandonedUploadsJob,
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  GetMediaQuery,
  HandleVideoProviderEventHandler,
  MEDIA,
  ProcessImageHandler,
  ScanVideoHandler,
} from './application/media.use-cases.js';
import type {
  ContentScanner,
  ImageProcessor,
  ObjectStorage,
  PlaybackSigner,
  VideoProvider,
  VideoWebhookVerifier,
} from './application/ports.js';
import { MediaEvents, type MediaAssetRepository } from './domain/media-asset.js';
import type { ScanPolicy } from './domain/scan-decision.js';
import { DrizzleMediaAssetRepository } from './infrastructure/drizzle-media-asset.repository.js';
import {
  DevelopmentAllowAllScanner,
  RekognitionContentScanner,
} from './infrastructure/rekognition-content-scanner.js';
import {
  DisabledVideoProvider,
  MuxPlaybackSigner,
  MuxVideoProvider,
  MuxWebhookVerifier,
} from './infrastructure/mux-video-provider.js';
import { S3ObjectStorage } from './infrastructure/s3-object-storage.js';
import { SharpImageProcessor } from './infrastructure/sharp-image-processor.js';
import { MediaController } from './interface/http/media.controller.js';
import { VideoWebhookController } from './interface/http/video-webhook.controller.js';

/** The provider and its signer share one instance, so the signing key is read once. */
const VIDEO_PARTS = Symbol('VideoParts');
interface VideoParts {
  readonly provider: VideoProvider;
  readonly signer: PlaybackSigner;
  readonly verifier: VideoWebhookVerifier | null;
}

@Module({
  imports: [AccountsModule],
  controllers: [MediaController, VideoWebhookController],
  providers: [
    {
      provide: VIDEO_PARTS,
      inject: [PLATFORM.Config, PLATFORM.Clock],
      useFactory: (config: AppConfig, clock: Clock): VideoParts => {
        if (config.VIDEO_PROVIDER !== 'mux') {
          const disabled = new DisabledVideoProvider();
          return { provider: disabled, signer: disabled, verifier: null };
        }
        // loadConfig has already refused mux without every MUX_ setting.
        const settings = {
          tokenId: config.MUX_TOKEN_ID ?? '',
          tokenSecret: config.MUX_TOKEN_SECRET ?? '',
          signingKeyId: config.MUX_SIGNING_KEY_ID ?? '',
          signingPrivateKeyBase64: config.MUX_SIGNING_PRIVATE_KEY_BASE64 ?? '',
          playbackTtlSeconds: config.VIDEO_PLAYBACK_TTL_SECONDS,
        };
        const signer = new MuxPlaybackSigner(settings, clock);
        return {
          provider: new MuxVideoProvider(settings, signer),
          signer,
          verifier: new MuxWebhookVerifier(config.MUX_WEBHOOK_SECRET ?? '', clock),
        };
      },
    },
    {
      provide: MEDIA.Video,
      inject: [VIDEO_PARTS],
      useFactory: (parts: VideoParts) => parts.provider,
    },
    {
      provide: MEDIA.Signer,
      inject: [VIDEO_PARTS],
      useFactory: (parts: VideoParts) => parts.signer,
    },
    {
      provide: MEDIA.WebhookVerifier,
      inject: [VIDEO_PARTS],
      useFactory: (parts: VideoParts) => parts.verifier,
    },
    {
      provide: MEDIA.Presenter,
      inject: [MEDIA.Urls, MEDIA.Signer],
      useFactory: (urls: MediaUrls, signer: PlaybackSigner) => new MediaPresenter(urls, signer),
    },
    {
      provide: MEDIA.Repository,
      inject: [PLATFORM.UnitOfWork, PLATFORM.EventRecorder],
      useFactory: (uow: DrizzleUnitOfWork, events: EventRecorder) =>
        new DrizzleMediaAssetRepository(uow, events),
    },
    {
      provide: MEDIA.Storage,
      inject: [PLATFORM.Config],
      useFactory: (config: AppConfig) =>
        new S3ObjectStorage(
          new S3Client({
            ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
            forcePathStyle: config.S3_FORCE_PATH_STYLE,
          }),
          config.MEDIA_BUCKET,
        ),
    },
    { provide: MEDIA.Processor, useFactory: () => new SharpImageProcessor() },
    {
      provide: MEDIA.Scanner,
      inject: [PLATFORM.Config],
      useFactory: (config: AppConfig): ContentScanner =>
        config.CONTENT_SCANNER === 'rekognition'
          ? new RekognitionContentScanner(new RekognitionClient({}))
          : new DevelopmentAllowAllScanner(),
    },
    {
      provide: MEDIA.ScanPolicy,
      inject: [PLATFORM.Config],
      useFactory: (config: AppConfig): ScanPolicy => ({
        reviewAt: config.SCAN_REVIEW_AT,
        rejectAt: config.SCAN_REJECT_AT,
      }),
    },
    {
      provide: MEDIA.Urls,
      inject: [PLATFORM.Config],
      useFactory: (config: AppConfig) => new MediaUrls(config.MEDIA_CDN_URL),
    },
    {
      provide: MEDIA.CreateIntent,
      inject: [
        MEDIA.Repository,
        MEDIA.Storage,
        MEDIA.Video,
        ACCOUNTS.Facade,
        PLATFORM.RateLimiter,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        video: VideoProvider,
        accounts: AccountsFacade,
        limiter: RateLimiter,
        clock: Clock,
      ) => new CreateUploadIntentHandler(repo, storage, video, accounts, limiter, clock),
    },
    {
      provide: MEDIA.Complete,
      inject: [
        MEDIA.Repository,
        MEDIA.Storage,
        MEDIA.Video,
        MEDIA.Presenter,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        video: VideoProvider,
        presenter: MediaPresenter,
        uow: UnitOfWork,
        clock: Clock,
      ) => new CompleteUploadHandler(repo, storage, video, presenter, uow, clock),
    },
    {
      provide: MEDIA.Get,
      inject: [MEDIA.Repository, MEDIA.Presenter],
      useFactory: (repo: MediaAssetRepository, presenter: MediaPresenter) =>
        new GetMediaQuery(repo, presenter),
    },
    {
      provide: MEDIA.Process,
      inject: [
        MEDIA.Repository,
        MEDIA.Storage,
        MEDIA.Processor,
        MEDIA.Scanner,
        MEDIA.ScanPolicy,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        processor: ImageProcessor,
        scanner: ContentScanner,
        policy: ScanPolicy,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new ProcessImageHandler(repo, storage, processor, scanner, policy, uow, clock, logger),
    },
    {
      provide: MEDIA.Facade,
      inject: [MEDIA.Repository, MEDIA.Presenter, PLATFORM.Clock],
      useFactory: (repo: MediaAssetRepository, presenter: MediaPresenter, clock: Clock) =>
        new MediaFacade(repo, presenter, clock),
    },
    {
      provide: MEDIA.RemoveDeleted,
      inject: [MEDIA.Repository, MEDIA.Storage, MEDIA.Video, PLATFORM.Logger],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        video: VideoProvider,
        logger: Logger,
      ) => new RemoveDeletedMediaHandler(repo, storage, video, logger),
    },
    {
      provide: MEDIA.ScanVideo,
      inject: [
        MEDIA.Repository,
        MEDIA.Video,
        MEDIA.Scanner,
        MEDIA.ScanPolicy,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        video: VideoProvider,
        scanner: ContentScanner,
        policy: ScanPolicy,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new ScanVideoHandler(repo, video, scanner, policy, uow, clock, logger),
    },
    {
      provide: MEDIA.VideoEvents,
      inject: [MEDIA.Repository, MEDIA.Video, PLATFORM.UnitOfWork, PLATFORM.Clock, PLATFORM.Logger],
      useFactory: (
        repo: MediaAssetRepository,
        video: VideoProvider,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new HandleVideoProviderEventHandler(repo, video, uow, clock, logger),
    },
    {
      provide: MEDIA.AbandonedUploads,
      inject: [
        MEDIA.Repository,
        MEDIA.Storage,
        MEDIA.Video,
        PLATFORM.UnitOfWork,
        PLATFORM.Clock,
        PLATFORM.Logger,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        video: VideoProvider,
        uow: UnitOfWork,
        clock: Clock,
        logger: Logger,
      ) => new AbandonedUploadsJob(repo, storage, video, uow, clock, logger),
    },
    {
      provide: MEDIA.EventHandlers,
      inject: [MEDIA.Process, MEDIA.ScanVideo, MEDIA.RemoveDeleted],
      useFactory: (
        processImage: ProcessImageHandler,
        scanVideo: ScanVideoHandler,
        removeDeleted: RemoveDeletedMediaHandler,
      ): ModuleEventHandlers => ({
        register: (dispatcher) => {
          dispatcher.on(MediaEvents.Uploaded, (event) => processImage.handle(event));
          dispatcher.on(MediaEvents.VideoTranscoded, (event) => scanVideo.handle(event));
          dispatcher.on(MediaEvents.Deleted, (event) => removeDeleted.handle(event));
          dispatcher.on(MediaEvents.Rejected, (event) => removeDeleted.handle(event));
        },
      }),
    },
  ],
  exports: [MEDIA.Urls, MEDIA.Facade, MEDIA.EventHandlers, MEDIA.AbandonedUploads],
})
export class MediaModule {}
