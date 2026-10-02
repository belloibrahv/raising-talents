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
import { MediaUrls } from './application/media-urls.js';
import {
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  GetMediaQuery,
  MEDIA,
  ProcessImageHandler,
} from './application/media.use-cases.js';
import type { ContentScanner, ImageProcessor, ObjectStorage } from './application/ports.js';
import { MediaEvents, type MediaAssetRepository } from './domain/media-asset.js';
import type { ScanPolicy } from './domain/scan-decision.js';
import { DrizzleMediaAssetRepository } from './infrastructure/drizzle-media-asset.repository.js';
import {
  DevelopmentAllowAllScanner,
  RekognitionContentScanner,
} from './infrastructure/rekognition-content-scanner.js';
import { S3ObjectStorage } from './infrastructure/s3-object-storage.js';
import { SharpImageProcessor } from './infrastructure/sharp-image-processor.js';
import { MediaController } from './interface/http/media.controller.js';

@Module({
  imports: [AccountsModule],
  controllers: [MediaController],
  providers: [
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
        ACCOUNTS.Facade,
        PLATFORM.RateLimiter,
        PLATFORM.Clock,
      ],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        accounts: AccountsFacade,
        limiter: RateLimiter,
        clock: Clock,
      ) => new CreateUploadIntentHandler(repo, storage, accounts, limiter, clock),
    },
    {
      provide: MEDIA.Complete,
      inject: [MEDIA.Repository, MEDIA.Storage, MEDIA.Urls, PLATFORM.UnitOfWork, PLATFORM.Clock],
      useFactory: (
        repo: MediaAssetRepository,
        storage: ObjectStorage,
        urls: MediaUrls,
        uow: UnitOfWork,
        clock: Clock,
      ) => new CompleteUploadHandler(repo, storage, urls, uow, clock),
    },
    {
      provide: MEDIA.Get,
      inject: [MEDIA.Repository, MEDIA.Urls],
      useFactory: (repo: MediaAssetRepository, urls: MediaUrls) => new GetMediaQuery(repo, urls),
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
      provide: MEDIA.EventHandlers,
      inject: [MEDIA.Process],
      useFactory: (processImage: ProcessImageHandler): ModuleEventHandlers => ({
        register: (dispatcher) => {
          dispatcher.on(MediaEvents.Uploaded, (event) => processImage.handle(event));
        },
      }),
    },
  ],
  exports: [MEDIA.Urls, MEDIA.EventHandlers],
})
export class MediaModule {}
