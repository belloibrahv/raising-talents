import type { CredentialRepository } from '../domain/credential.repository.js';
import type { PasswordHasher } from './ports.js';

/** What other modules may ask of identity. */
export class IdentityFacade {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /** For confirming a serious action, such as deleting the account, with the current password. */
  async passwordMatches(userId: string, password: string): Promise<boolean> {
    const hash = await this.credentials.findPasswordHash(userId);
    return hash !== null && (await this.hasher.verify(hash, password));
  }
}
