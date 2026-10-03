import type { Session, SessionRevokedReason } from './session.js';

/** A signed-in device: the live session of one family. */
export interface ActiveDevice {
  readonly familyId: string;
  readonly deviceLabel: string | null;
  /** When the person signed in on this device. */
  readonly signedInAt: Date;
  /** The last refresh, which happens whenever the app is used. */
  readonly lastActiveAt: Date;
}

export interface SessionRepository {
  /** With lock: true the row is locked until the transaction ends, so two refreshes cannot both win. */
  findByRefreshTokenHash(hash: string, options?: { lock?: boolean }): Promise<Session | null>;
  findById(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  revokeFamily(familyId: string, reason: SessionRevokedReason, now: Date): Promise<void>;
  /** Ends every session the person has, on every device. */
  revokeAllForUser(userId: string, reason: SessionRevokedReason, now: Date): Promise<void>;
  /** Ends every session except those of one device, the one the person is using. */
  revokeOtherFamilies(
    userId: string,
    keepFamilyId: string,
    reason: SessionRevokedReason,
    now: Date,
  ): Promise<void>;
  /** Devices with a session that is neither revoked nor expired, most recently used first. */
  activeDevices(userId: string, now: Date): Promise<ActiveDevice[]>;
}
