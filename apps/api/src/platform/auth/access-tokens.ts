import type { Principal } from '../http/authenticated-request.js';

export interface IssuedAccessToken {
  readonly token: string;
  readonly expiresAt: Date;
}

export interface AccessTokenIssuer {
  issue(principal: Principal): Promise<IssuedAccessToken>;
}

/** Checks an access token and returns who it belongs to, or null if it is not valid. */
export interface AccessTokenVerifier {
  verify(token: string): Promise<Principal | null>;
}

export const ACCESS_TOKENS = {
  Issuer: Symbol('AccessTokenIssuer'),
  Verifier: Symbol('AccessTokenVerifier'),
} as const;
