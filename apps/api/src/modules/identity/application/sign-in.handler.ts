import type { DomainError } from '../../../platform/domain-error.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import type { AccountDirectory, PasswordHasher } from './ports.js';
import type { SessionIssuer } from './session-issuer.js';
import type { SignedIn } from './sign-up.handler.js';

export interface SignInCommand {
  readonly email: string;
  readonly password: string;
  readonly deviceId: string;
  readonly ip: string;
}

export const SIGN_IN_LIMITS = { perIp: 50, perEmail: 10, windowSeconds: 900 } as const;

export class SignInHandler {
  private timingHash: Promise<string> | undefined;

  constructor(
    private readonly directory: AccountDirectory,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async execute(command: SignInCommand): Promise<Result<SignedIn, DomainError>> {
    const byIp = await this.rateLimiter.consume(
      `sign-in:ip:${command.ip}`,
      SIGN_IN_LIMITS.perIp,
      SIGN_IN_LIMITS.windowSeconds,
    );
    if (!byIp.allowed) return err(IdentityErrors.rateLimited(byIp.retryAfterSeconds));
    const byEmail = await this.rateLimiter.consume(
      `sign-in:email:${command.email}`,
      SIGN_IN_LIMITS.perEmail,
      SIGN_IN_LIMITS.windowSeconds,
    );
    if (!byEmail.allowed) return err(IdentityErrors.rateLimited(byEmail.retryAfterSeconds));

    const account = await this.directory.findByEmail(command.email);
    const passwordHash = account ? await this.credentials.findPasswordHash(account.id) : null;

    // When there is no account we still verify against a real hash, so response
    // time does not reveal which emails are registered.
    const passwordMatches = passwordHash
      ? await this.hasher.verify(passwordHash, command.password)
      : await this.verifyAgainstTimingHash(command.password);
    if (!account || !passwordHash || !passwordMatches)
      return err(IdentityErrors.invalidCredentials());

    const allowed = await this.directory.ensureCanSignIn(account.id);
    if (!allowed.ok) return allowed;

    const { session, refreshToken } = await this.issuer.start(account.id, command.deviceId);
    return ok({ userId: account.id, tokens: await this.issuer.tokensFor(session, refreshToken) });
  }

  private async verifyAgainstTimingHash(password: string): Promise<false> {
    this.timingHash ??= this.hasher.hash('raising-talents-timing-equaliser');
    await this.hasher.verify(await this.timingHash, password);
    return false;
  }
}
