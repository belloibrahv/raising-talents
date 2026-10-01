import type { OneTimeCode, OneTimeCodePurpose } from './one-time-code.js';

export interface OneTimeCodeRepository {
  /** The most recently issued code for the purpose, used or not. */
  findLatest(userId: string, purpose: OneTimeCodePurpose): Promise<OneTimeCode | null>;
  save(code: OneTimeCode): Promise<void>;
}
