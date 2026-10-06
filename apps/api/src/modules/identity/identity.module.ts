import { Module, type Provider } from '@nestjs/common';
import type { Logger } from 'pino';
import type { AppConfig } from '../../config/env.js';
import { ACCESS_TOKENS, type AccessTokenIssuer } from '../../platform/auth/access-tokens.js';
import type { Clock } from '../../platform/clock.js';
import type { DrizzleUnitOfWork } from '../../platform/database/drizzle-unit-of-work.js';
import type { EventRecorder } from '../../platform/domain-event.js';
import type { EventDispatcher } from '../../platform/outbox/event-dispatcher.js';
import { PLATFORM } from '../../platform/platform.tokens.js';
import type { RateLimiter } from '../../platform/rate-limit/rate-limiter.js';
import type { UnitOfWork } from '../../platform/unit-of-work.js';
import type { AccountsFacade } from '../accounts/application/accounts.facade.js';
import { ACCOUNTS } from '../accounts/application/accounts.tokens.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { IDENTITY } from './application/identity.tokens.js';
import { IssueEmailVerificationCodeHandler } from './application/issue-email-verification-code.handler.js';
import type {
  AccountDirectory,
  BreachedPasswordChecker,
  EmailSender,
  IdentitySettings,
  PasswordHasher,
  RefreshTokenFactory,
  VerificationCodeFactory,
} from './application/ports.js';
import { RefreshSessionHandler } from './application/refresh-session.handler.js';
import { RequestEmailVerificationHandler } from './application/request-email-verification.handler.js';
import { SessionIssuer } from './application/session-issuer.js';
import { SignInHandler } from './application/sign-in.handler.js';
import { SignOutHandler } from './application/sign-out.handler.js';
import { SignUpHandler } from './application/sign-up.handler.js';
import { VerifyEmailHandler } from './application/verify-email.handler.js';
import type { CredentialRepository } from './domain/credential.repository.js';
import { IdentityEvents } from './domain/identity.events.js';
import { IdentityFacade } from './application/identity.facade.js';
import {
  IssuePasswordResetCodeHandler,
  NotifyPasswordChangedHandler,
  RequestPasswordResetHandler,
  ResetPasswordHandler,
} from './application/password-reset.handlers.js';
import type { OneTimeCodeRepository } from './domain/one-time-code.repository.js';
import type { SessionRepository } from './domain/session.repository.js';
import { accountsDirectory } from './infrastructure/accounts-directory.adapter.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import {
  CryptoRefreshTokenFactory,
  HmacVerificationCodeFactory,
} from './infrastructure/crypto-token-factories.js';
import { DrizzleCredentialRepository } from './infrastructure/drizzle-credential.repository.js';
import { DrizzleOneTimeCodeRepository } from './infrastructure/drizzle-one-time-code.repository.js';
import { DrizzleSessionRepository } from './infrastructure/drizzle-session.repository.js';
import { HibpBreachedPasswordChecker } from './infrastructure/hibp-breached-password-checker.js';
import { AuthController } from './interface/http/auth.controller.js';
import { WebAuthController } from './interface/http/web-auth.controller.js';
import {
  ChangePasswordHandler,
  ListDevicesQuery,
  SignOutDeviceHandler,
  SignOutOtherDevicesHandler,
} from './application/account-security.handlers.js';
import { SecurityController } from './interface/http/security.controller.js';
import { AccountEvents } from '../accounts/domain/account.events.js';
import {
  CancelEmailChangeHandler,
  ConfirmEmailChangeHandler,
  GetPendingEmailChangeQuery,
  IssueEmailChangeCodeHandler,
  NotifyEmailChangedHandler,
  RequestEmailChangeHandler,
} from './application/email-change.handlers.js';
import type { EmailChangeRepository } from './domain/email-change.js';
import { DrizzleEmailChangeRepository } from './infrastructure/drizzle-email-change.repository.js';

/** Registers identity's reactions to published events. Called by the worker. */
export interface ModuleEventHandlers {
  register(dispatcher: EventDispatcher): void;
}

/** Adapters: the only providers that touch the database, crypto, email or outside services. */
const infrastructureProviders: Provider[] = [
  {
    provide: IDENTITY.Settings,
    inject: [PLATFORM.Config],
    useFactory: (config: AppConfig): IdentitySettings => ({
      refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      breachedPasswordCheck: config.BREACHED_PASSWORD_CHECK,
      emailVerification: config.EMAIL_VERIFICATION,
    }),
  },
  {
    provide: IDENTITY.Sessions,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleSessionRepository(uow),
  },
  {
    provide: IDENTITY.Credentials,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleCredentialRepository(uow),
  },
  {
    provide: IDENTITY.Codes,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleOneTimeCodeRepository(uow),
  },
  { provide: IDENTITY.PasswordHasher, useFactory: () => new Argon2PasswordHasher() },
  {
    provide: IDENTITY.BreachedPasswords,
    inject: [PLATFORM.Logger],
    useFactory: (logger: Logger) => new HibpBreachedPasswordChecker(logger),
  },
  { provide: IDENTITY.RefreshTokens, useFactory: () => new CryptoRefreshTokenFactory() },
  {
    provide: IDENTITY.VerificationCodes,
    inject: [PLATFORM.Config],
    useFactory: (config: AppConfig) =>
      new HmacVerificationCodeFactory(config.VERIFICATION_CODE_PEPPER),
  },
  // One sender for the whole API, provided by the platform.
  { provide: IDENTITY.EmailSender, useExisting: PLATFORM.EmailSender },
  {
    provide: IDENTITY.AccountDirectory,
    inject: [ACCOUNTS.Facade],
    useFactory: (facade: AccountsFacade) => accountsDirectory(facade),
  },
  {
    provide: IDENTITY.EmailChanges,
    inject: [PLATFORM.UnitOfWork],
    useFactory: (uow: DrizzleUnitOfWork) => new DrizzleEmailChangeRepository(uow),
  },
];

/** Use cases: built from ports only, so tests can swap every adapter above. */
const applicationProviders: Provider[] = [
  {
    provide: IDENTITY.SessionIssuer,
    inject: [
      IDENTITY.Sessions,
      IDENTITY.RefreshTokens,
      ACCESS_TOKENS.Issuer,
      PLATFORM.Clock,
      IDENTITY.Settings,
    ],
    useFactory: (
      sessions: SessionRepository,
      refreshTokens: RefreshTokenFactory,
      accessTokens: AccessTokenIssuer,
      clock: Clock,
      settings: IdentitySettings,
    ) => new SessionIssuer(sessions, refreshTokens, accessTokens, clock, settings),
  },
  {
    provide: IDENTITY.SignUp,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Credentials,
      IDENTITY.PasswordHasher,
      IDENTITY.BreachedPasswords,
      IDENTITY.SessionIssuer,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
      IDENTITY.Settings,
    ],
    useFactory: (
      directory: AccountDirectory,
      credentials: CredentialRepository,
      hasher: PasswordHasher,
      breached: BreachedPasswordChecker,
      issuer: SessionIssuer,
      events: EventRecorder,
      rateLimiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
      settings: IdentitySettings,
    ) =>
      new SignUpHandler(
        directory,
        credentials,
        hasher,
        breached,
        issuer,
        events,
        rateLimiter,
        uow,
        clock,
        settings,
      ),
  },
  {
    provide: IDENTITY.SignIn,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Credentials,
      IDENTITY.PasswordHasher,
      IDENTITY.SessionIssuer,
      PLATFORM.RateLimiter,
    ],
    useFactory: (
      directory: AccountDirectory,
      credentials: CredentialRepository,
      hasher: PasswordHasher,
      issuer: SessionIssuer,
      rateLimiter: RateLimiter,
    ) => new SignInHandler(directory, credentials, hasher, issuer, rateLimiter),
  },
  {
    provide: IDENTITY.RefreshSession,
    inject: [
      IDENTITY.Sessions,
      IDENTITY.RefreshTokens,
      IDENTITY.AccountDirectory,
      IDENTITY.SessionIssuer,
      PLATFORM.EventRecorder,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
    ],
    useFactory: (
      sessions: SessionRepository,
      refreshTokens: RefreshTokenFactory,
      directory: AccountDirectory,
      issuer: SessionIssuer,
      events: EventRecorder,
      uow: UnitOfWork,
      clock: Clock,
    ) => new RefreshSessionHandler(sessions, refreshTokens, directory, issuer, events, uow, clock),
  },
  {
    provide: IDENTITY.SignOut,
    inject: [IDENTITY.Sessions, IDENTITY.RefreshTokens, PLATFORM.Clock],
    useFactory: (sessions: SessionRepository, refreshTokens: RefreshTokenFactory, clock: Clock) =>
      new SignOutHandler(sessions, refreshTokens, clock),
  },
  {
    provide: IDENTITY.VerifyEmail,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      rateLimiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
    ) => new VerifyEmailHandler(directory, codes, codeFactory, rateLimiter, uow, clock),
  },
  {
    provide: IDENTITY.RequestEmailVerification,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      events: EventRecorder,
      rateLimiter: RateLimiter,
      clock: Clock,
    ) => new RequestEmailVerificationHandler(directory, codes, events, rateLimiter, clock),
  },
  {
    provide: IDENTITY.IssueEmailVerificationCode,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      IDENTITY.EmailSender,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      email: EmailSender,
      clock: Clock,
    ) => new IssueEmailVerificationCodeHandler(directory, codes, codeFactory, email, clock),
  },
  {
    provide: IDENTITY.RequestPasswordReset,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      events: EventRecorder,
      limiter: RateLimiter,
      clock: Clock,
    ) => new RequestPasswordResetHandler(directory, codes, events, limiter, clock),
  },
  {
    provide: IDENTITY.IssuePasswordResetCode,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      IDENTITY.EmailSender,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      email: EmailSender,
      clock: Clock,
    ) => new IssuePasswordResetCodeHandler(directory, codes, codeFactory, email, clock),
  },
  {
    provide: IDENTITY.ResetPassword,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      IDENTITY.Credentials,
      IDENTITY.Sessions,
      IDENTITY.PasswordHasher,
      IDENTITY.BreachedPasswords,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
      IDENTITY.Settings,
    ],
    useFactory: (
      directory: AccountDirectory,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      credentials: CredentialRepository,
      sessions: SessionRepository,
      hasher: PasswordHasher,
      breached: BreachedPasswordChecker,
      events: EventRecorder,
      limiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
      settings: IdentitySettings,
    ) =>
      new ResetPasswordHandler(
        directory,
        codes,
        codeFactory,
        credentials,
        sessions,
        hasher,
        breached,
        events,
        limiter,
        uow,
        clock,
        settings,
      ),
  },
  {
    provide: IDENTITY.ChangePassword,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Credentials,
      IDENTITY.Sessions,
      IDENTITY.PasswordHasher,
      IDENTITY.BreachedPasswords,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
      IDENTITY.Settings,
    ],
    useFactory: (
      directory: AccountDirectory,
      credentials: CredentialRepository,
      sessions: SessionRepository,
      hasher: PasswordHasher,
      breached: BreachedPasswordChecker,
      events: EventRecorder,
      limiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
      settings: IdentitySettings,
    ) =>
      new ChangePasswordHandler(
        directory,
        credentials,
        sessions,
        hasher,
        breached,
        events,
        limiter,
        uow,
        clock,
        settings,
      ),
  },
  {
    provide: IDENTITY.ListDevices,
    inject: [IDENTITY.Sessions, PLATFORM.Clock],
    useFactory: (sessions: SessionRepository, clock: Clock) =>
      new ListDevicesQuery(sessions, clock),
  },
  {
    provide: IDENTITY.SignOutDevice,
    inject: [IDENTITY.Sessions, PLATFORM.Clock],
    useFactory: (sessions: SessionRepository, clock: Clock) =>
      new SignOutDeviceHandler(sessions, clock),
  },
  {
    provide: IDENTITY.SignOutOthers,
    inject: [IDENTITY.Sessions, PLATFORM.Clock],
    useFactory: (sessions: SessionRepository, clock: Clock) =>
      new SignOutOtherDevicesHandler(sessions, clock),
  },
  {
    provide: IDENTITY.Facade,
    inject: [IDENTITY.Credentials, IDENTITY.PasswordHasher, IDENTITY.Sessions, PLATFORM.Clock],
    useFactory: (
      credentials: CredentialRepository,
      hasher: PasswordHasher,
      sessions: SessionRepository,
      clock: Clock,
    ) => new IdentityFacade(credentials, hasher, sessions, clock),
  },
  {
    provide: IDENTITY.NotifyPasswordChanged,
    inject: [IDENTITY.AccountDirectory, IDENTITY.EmailSender],
    useFactory: (directory: AccountDirectory, email: EmailSender) =>
      new NotifyPasswordChangedHandler(directory, email),
  },
  {
    provide: IDENTITY.RequestEmailChange,
    inject: [
      IDENTITY.AccountDirectory,
      IDENTITY.Credentials,
      IDENTITY.PasswordHasher,
      IDENTITY.EmailChanges,
      IDENTITY.Codes,
      PLATFORM.EventRecorder,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
    ],
    useFactory: (
      directory: AccountDirectory,
      credentials: CredentialRepository,
      hasher: PasswordHasher,
      changes: EmailChangeRepository,
      codes: OneTimeCodeRepository,
      events: EventRecorder,
      limiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
    ) =>
      new RequestEmailChangeHandler(
        directory,
        credentials,
        hasher,
        changes,
        codes,
        events,
        limiter,
        uow,
        clock,
      ),
  },
  {
    provide: IDENTITY.IssueEmailChangeCode,
    inject: [
      IDENTITY.EmailChanges,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      IDENTITY.EmailSender,
      PLATFORM.Clock,
    ],
    useFactory: (
      changes: EmailChangeRepository,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      email: EmailSender,
      clock: Clock,
    ) => new IssueEmailChangeCodeHandler(changes, codes, codeFactory, email, clock),
  },
  {
    provide: IDENTITY.PendingEmailChange,
    inject: [IDENTITY.EmailChanges, PLATFORM.Clock],
    useFactory: (changes: EmailChangeRepository, clock: Clock) =>
      new GetPendingEmailChangeQuery(changes, clock),
  },
  {
    provide: IDENTITY.CancelEmailChange,
    inject: [IDENTITY.EmailChanges, PLATFORM.Clock],
    useFactory: (changes: EmailChangeRepository, clock: Clock) =>
      new CancelEmailChangeHandler(changes, clock),
  },
  {
    provide: IDENTITY.ConfirmEmailChange,
    inject: [
      IDENTITY.EmailChanges,
      IDENTITY.Codes,
      IDENTITY.VerificationCodes,
      IDENTITY.AccountDirectory,
      ACCOUNTS.Facade,
      PLATFORM.RateLimiter,
      PLATFORM.UnitOfWork,
      PLATFORM.Clock,
    ],
    useFactory: (
      changes: EmailChangeRepository,
      codes: OneTimeCodeRepository,
      codeFactory: VerificationCodeFactory,
      directory: AccountDirectory,
      accounts: AccountsFacade,
      limiter: RateLimiter,
      uow: UnitOfWork,
      clock: Clock,
    ) =>
      new ConfirmEmailChangeHandler(
        changes,
        codes,
        codeFactory,
        directory,
        accounts,
        limiter,
        uow,
        clock,
      ),
  },
  {
    provide: IDENTITY.NotifyEmailChanged,
    inject: [IDENTITY.EmailChanges, IDENTITY.EmailSender],
    useFactory: (changes: EmailChangeRepository, email: EmailSender) =>
      new NotifyEmailChangedHandler(changes, email),
  },
  {
    provide: IDENTITY.EventHandlers,
    inject: [
      IDENTITY.IssueEmailVerificationCode,
      IDENTITY.IssuePasswordResetCode,
      IDENTITY.NotifyPasswordChanged,
      IDENTITY.IssueEmailChangeCode,
      IDENTITY.NotifyEmailChanged,
    ],
    useFactory: (
      issueCode: IssueEmailVerificationCodeHandler,
      issueResetCode: IssuePasswordResetCodeHandler,
      notifyPasswordChanged: NotifyPasswordChangedHandler,
      issueEmailChangeCode: IssueEmailChangeCodeHandler,
      notifyEmailChanged: NotifyEmailChangedHandler,
    ): ModuleEventHandlers => ({
      register: (dispatcher) => {
        dispatcher.on(IdentityEvents.EmailChangeRequested, (event) =>
          issueEmailChangeCode.handle(event),
        );
        dispatcher.on(AccountEvents.EmailChanged, (event) => notifyEmailChanged.handle(event));
        dispatcher.on(IdentityEvents.EmailVerificationRequested, (event) =>
          issueCode.handle(event),
        );
        dispatcher.on(IdentityEvents.PasswordResetRequested, (event) =>
          issueResetCode.handle(event),
        );
        dispatcher.on(IdentityEvents.PasswordChanged, (event) =>
          notifyPasswordChanged.handle(event),
        );
      },
    }),
  },
];

@Module({
  imports: [AccountsModule],
  controllers: [AuthController, WebAuthController, SecurityController],
  providers: [...infrastructureProviders, ...applicationProviders],
  exports: [IDENTITY.EventHandlers, IDENTITY.Facade],
})
export class IdentityModule {}
