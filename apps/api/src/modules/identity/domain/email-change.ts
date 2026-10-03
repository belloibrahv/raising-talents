/** A move to a new address, waiting for the code sent there. */
export interface EmailChange {
  readonly userId: string;
  readonly newEmail: string;
  /** Kept so the old address can be told once the change is done. */
  readonly previousEmail: string;
  readonly requestedAt: Date;
  readonly confirmedAt: Date | null;
}

export interface EmailChangeRepository {
  find(userId: string): Promise<EmailChange | null>;
  /** One per account: a new request replaces the last. */
  save(change: EmailChange): Promise<void>;
  remove(userId: string): Promise<void>;
}
