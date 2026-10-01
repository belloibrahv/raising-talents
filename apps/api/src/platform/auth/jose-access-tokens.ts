import { SignJWT, importPKCS8, importSPKI, jwtVerify, type CryptoKey } from 'jose';
import type { Clock } from '../clock.js';
import type { Principal } from '../http/authenticated-request.js';
import type { AccessTokenIssuer, AccessTokenVerifier, IssuedAccessToken } from './access-tokens.js';

export interface JoseAccessTokenSettings {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  readonly keyId: string;
  readonly issuer: string;
  readonly audience: string;
  readonly ttlSeconds: number;
}

const ALGORITHM = 'EdDSA';

/**
 * Short-lived Ed25519-signed JWTs. Claims carry only the user and session ids:
 * roles and permissions are read from the database by policies, so a role change
 * never waits for a token to expire.
 */
export class JoseAccessTokens implements AccessTokenIssuer, AccessTokenVerifier {
  private constructor(
    private readonly privateKey: CryptoKey,
    private readonly publicKey: CryptoKey,
    private readonly settings: JoseAccessTokenSettings,
    private readonly clock: Clock,
  ) {}

  static async create(settings: JoseAccessTokenSettings, clock: Clock): Promise<JoseAccessTokens> {
    const privateKey = await importPKCS8(settings.privateKeyPem, ALGORITHM);
    const publicKey = await importSPKI(settings.publicKeyPem, ALGORITHM);
    return new JoseAccessTokens(privateKey, publicKey, settings, clock);
  }

  async issue(principal: Principal): Promise<IssuedAccessToken> {
    const issuedAtSeconds = Math.floor(this.clock.now().getTime() / 1000);
    const expiresAtSeconds = issuedAtSeconds + this.settings.ttlSeconds;
    const token = await new SignJWT({ sid: principal.sessionId })
      .setProtectedHeader({ alg: ALGORITHM, kid: this.settings.keyId, typ: 'JWT' })
      .setSubject(principal.userId)
      .setIssuer(this.settings.issuer)
      .setAudience(this.settings.audience)
      .setIssuedAt(issuedAtSeconds)
      .setExpirationTime(expiresAtSeconds)
      .sign(this.privateKey);
    return { token, expiresAt: new Date(expiresAtSeconds * 1000) };
  }

  async verify(token: string): Promise<Principal | null> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.settings.issuer,
        audience: this.settings.audience,
        algorithms: [ALGORITHM],
        currentDate: this.clock.now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string') return null;
      return { userId: payload.sub, sessionId: payload['sid'] };
    } catch {
      return null;
    }
  }
}
