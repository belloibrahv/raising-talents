import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { JoseAccessTokens } from '../../../platform/auth/jose-access-tokens.js';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { AccountsFacade } from '../../accounts/application/accounts.facade.js';
import { CreateAccountHandler } from '../../accounts/application/create-account.handler.js';
import { GetMeQuery } from '../../accounts/application/get-me.query.js';
import { MarkEmailVerifiedHandler } from '../../accounts/application/mark-email-verified.handler.js';
import { InMemoryAccountRepository } from '../../accounts/testing/in-memory-account.repository.js';
import { IssueEmailVerificationCodeHandler } from '../application/issue-email-verification-code.handler.js';
import type { IdentitySettings } from '../application/ports.js';
import { RefreshSessionHandler } from '../application/refresh-session.handler.js';
import { RequestEmailVerificationHandler } from '../application/request-email-verification.handler.js';
import { SessionIssuer } from '../application/session-issuer.js';
import { SignInHandler } from '../application/sign-in.handler.js';
import { SignOutHandler } from '../application/sign-out.handler.js';
import { SignUpHandler } from '../application/sign-up.handler.js';
import { VerifyEmailHandler } from '../application/verify-email.handler.js';
import { accountsDirectory } from '../infrastructure/accounts-directory.adapter.js';
import {
  CryptoRefreshTokenFactory,
  HmacVerificationCodeFactory,
} from '../infrastructure/crypto-token-factories.js';
import {
  CapturingEmailSender,
  FakeBreachedPasswordChecker,
  FakePasswordHasher,
  InMemoryCredentialRepository,
  InMemoryOneTimeCodeRepository,
  InMemorySessionRepository,
} from './fakes.js';

export async function generateTestSigningKeys() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', {
    crv: 'Ed25519',
    extractable: true,
  });
  return {
    privateKeyPem: await exportPKCS8(privateKey),
    publicKeyPem: await exportSPKI(publicKey),
  };
}

/** Builds every identity use case on in-memory adapters, sharing one set of fakes. */
export async function createIdentityHarness(settings: Partial<IdentitySettings> = {}) {
  const clock = new FixedClock();
  const uow = new InMemoryUnitOfWork();
  const events = new InMemoryEventRecorder();
  const rateLimiter = new InMemoryRateLimiter();
  const accountRepository = new InMemoryAccountRepository(events);
  const accounts = new AccountsFacade(
    accountRepository,
    new CreateAccountHandler(accountRepository),
    new MarkEmailVerifiedHandler(accountRepository, clock),
    new GetMeQuery(accountRepository),
  );
  const directory = accountsDirectory(accounts);
  const sessions = new InMemorySessionRepository();
  const credentials = new InMemoryCredentialRepository();
  const codes = new InMemoryOneTimeCodeRepository();
  const hasher = new FakePasswordHasher();
  const breached = new FakeBreachedPasswordChecker();
  const email = new CapturingEmailSender();
  const refreshTokens = new CryptoRefreshTokenFactory();
  const codeFactory = new HmacVerificationCodeFactory('test-pepper-0123456789abcdef0123456789');
  const fullSettings: IdentitySettings = {
    refreshTokenTtlDays: 30,
    breachedPasswordCheck: true,
    ...settings,
  };
  const keys = await generateTestSigningKeys();
  const accessTokens = await JoseAccessTokens.create(
    {
      ...keys,
      keyId: 'test-key',
      issuer: 'https://api.test',
      audience: 'raising-talents-test',
      ttlSeconds: 900,
    },
    clock,
  );
  const issuer = new SessionIssuer(sessions, refreshTokens, accessTokens, clock, fullSettings);

  return {
    clock,
    events,
    accountRepository,
    accounts,
    sessions,
    credentials,
    codes,
    email,
    accessTokens,
    refreshTokens,
    signUp: new SignUpHandler(
      directory,
      credentials,
      hasher,
      breached,
      issuer,
      events,
      rateLimiter,
      uow,
      clock,
      fullSettings,
    ),
    signIn: new SignInHandler(directory, credentials, hasher, issuer, rateLimiter),
    refresh: new RefreshSessionHandler(
      sessions,
      refreshTokens,
      directory,
      issuer,
      events,
      uow,
      clock,
    ),
    signOut: new SignOutHandler(sessions, refreshTokens, clock),
    requestVerification: new RequestEmailVerificationHandler(
      directory,
      codes,
      events,
      rateLimiter,
      clock,
    ),
    issueCode: new IssueEmailVerificationCodeHandler(directory, codes, codeFactory, email, clock),
    verifyEmail: new VerifyEmailHandler(directory, codes, codeFactory, rateLimiter, uow, clock),
  };
}

export type IdentityHarness = Awaited<ReturnType<typeof createIdentityHarness>>;

export const AMAKA = {
  email: 'amaka.okafor@example.com',
  password: 'striker-number-nine-lagos',
  dateOfBirth: '2003-06-12',
  countryCode: 'NG',
  deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
  ip: '102.89.34.10',
} as const;
