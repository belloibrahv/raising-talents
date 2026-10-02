import type { TalentProfile } from './talent-profile.js';

export class HandleConflictError extends Error {
  constructor(readonly handle: string) {
    super(`Handle ${handle} is already used`);
  }
}

export interface TalentProfileRepository {
  /** With lock: true the row stays locked until the transaction ends. */
  findByUserId(userId: string, options?: { lock?: boolean }): Promise<TalentProfile | null>;
  findByHandle(handle: string): Promise<TalentProfile | null>;
  handleExists(handle: string): Promise<boolean>;
  /** User ids of complete profiles after the given one, in id order. */
  listCompleteUserIds(after: string | null, limit: number): Promise<string[]>;
  /** Throws HandleConflictError if another profile took the handle meanwhile. */
  save(profile: TalentProfile): Promise<void>;
}
