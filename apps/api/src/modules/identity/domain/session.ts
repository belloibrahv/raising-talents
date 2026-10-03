export type SessionRevokedReason =
  | 'rotated'
  | 'signed_out'
  | 'reuse_detected'
  | 'device_mismatch'
  | 'account_blocked'
  | 'password_reset'
  | 'password_changed';

export interface SessionProps {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  /** Every session created by refreshing shares the family of the first sign-in. */
  readonly familyId: string;
  readonly refreshTokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly revokedReason: SessionRevokedReason | null;
  readonly createdAt: Date;
  /** "Chrome on Android": enough for the owner to recognise the device, nothing more. */
  readonly deviceLabel: string | null;
}

export type RefreshCheck =
  | { readonly kind: 'usable' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'reused' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'device_mismatch' };

/**
 * One signed-in device. Refresh tokens are single-use: refreshing replaces
 * this session with a new one in the same family. Presenting a token that was
 * already rotated means it was stolen or replayed, so the whole family is revoked.
 */
export class Session {
  private constructor(private props: SessionProps) {}

  static start(input: {
    id: string;
    userId: string;
    deviceId: string;
    refreshTokenHash: string;
    now: Date;
    ttlDays: number;
    familyId?: string;
    deviceLabel?: string | null;
  }): Session {
    return new Session({
      id: input.id,
      userId: input.userId,
      deviceId: input.deviceId,
      familyId: input.familyId ?? input.id,
      refreshTokenHash: input.refreshTokenHash,
      expiresAt: new Date(input.now.getTime() + input.ttlDays * 24 * 60 * 60 * 1000),
      revokedAt: null,
      revokedReason: null,
      createdAt: input.now,
      deviceLabel: input.deviceLabel ?? null,
    });
  }

  static restore(props: SessionProps): Session {
    return new Session(props);
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get familyId(): string {
    return this.props.familyId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  snapshot(): SessionProps {
    return { ...this.props };
  }

  checkRefresh(deviceId: string, now: Date): RefreshCheck {
    if (this.props.revokedReason === 'rotated') return { kind: 'reused' };
    if (this.props.revokedAt !== null) return { kind: 'revoked' };
    if (this.props.deviceId !== deviceId) return { kind: 'device_mismatch' };
    if (now >= this.props.expiresAt) return { kind: 'expired' };
    return { kind: 'usable' };
  }

  /** Retires this session and returns its successor in the same family. */
  rotate(input: {
    newId: string;
    newRefreshTokenHash: string;
    now: Date;
    ttlDays: number;
  }): Session {
    this.revoke('rotated', input.now);
    return Session.start({
      id: input.newId,
      userId: this.props.userId,
      deviceId: this.props.deviceId,
      familyId: this.props.familyId,
      refreshTokenHash: input.newRefreshTokenHash,
      now: input.now,
      ttlDays: input.ttlDays,
      deviceLabel: this.props.deviceLabel,
    });
  }

  revoke(reason: SessionRevokedReason, now: Date): void {
    if (this.props.revokedAt !== null) return;
    this.props = { ...this.props, revokedAt: now, revokedReason: reason };
  }
}
