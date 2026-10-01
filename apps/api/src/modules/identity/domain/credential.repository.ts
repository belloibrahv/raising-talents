export interface CredentialRepository {
  findPasswordHash(userId: string): Promise<string | null>;
  savePasswordHash(userId: string, passwordHash: string, now: Date): Promise<void>;
}
