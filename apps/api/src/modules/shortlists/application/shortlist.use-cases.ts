import {
  ErrorCode,
  SHORTLIST_MAX,
  SHORTLIST_PAGE_SIZE,
  type AccountStatus,
  type DataExport,
  type Role,
  type SaveToShortlist,
  type ShortlistEntry as ShortlistEntryView,
  type ShortlistPage,
  type TalentCard,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { ShortlistEntry, ShortlistRepository } from '../domain/shortlist.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';

export const SHORTLIST = {
  Entries: Symbol('ShortlistRepository'),
  Accounts: Symbol('ShortlistAccounts'),
  Talents: Symbol('ShortlistTalents'),
  List: Symbol('ListShortlistQuery'),
  Get: Symbol('GetShortlistEntryQuery'),
  Save: Symbol('SaveToShortlistHandler'),
  Remove: Symbol('RemoveFromShortlistHandler'),
  Export: Symbol('ShortlistExport'),
} as const;

/** What shortlists need from accounts. Implemented by AccountsFacade. */
export interface ShortlistAccounts {
  profileContext(userId: string): Promise<{ role: Role | null; status: AccountStatus } | null>;
}

/** What shortlists need from talent profiles. Implemented by TalentDirectory. */
export interface ShortlistTalents {
  visibleUserId(handle: string): Promise<string | null>;
  userIdOf(handle: string): Promise<string | null>;
  cardFor(userId: string): Promise<TalentCard | null>;
  handleOf(userId: string): Promise<string | null>;
}

export const ShortlistErrors = {
  wrongRole: () => domainError(ErrorCode.WrongRole, 'Only agents and scouts keep a shortlist.'),
  notActive: () =>
    domainError(ErrorCode.Forbidden, 'Finish setting up your agency profile to save talent.'),
  notFound: () => domainError(ErrorCode.NotFound, 'This profile is not available.'),
  notSaved: () => domainError(ErrorCode.NotFound, 'This talent is not on your shortlist.'),
  full: () =>
    domainError(
      ErrorCode.ShortlistFull,
      `Your shortlist holds ${String(SHORTLIST_MAX)} talent. Remove someone to save another.`,
    ),
};

/** Agents only. Saving needs an active account; reading and removing work for any agent. */
async function ensureAgent(
  accounts: ShortlistAccounts,
  userId: string,
  needActive: boolean,
): Promise<DomainError | null> {
  const account = await accounts.profileContext(userId);
  if (account?.role !== 'agent') return ShortlistErrors.wrongRole();
  if (needActive && account.status !== 'active') return ShortlistErrors.notActive();
  return null;
}

const view = (entry: ShortlistEntry, talent: TalentCard): ShortlistEntryView => ({
  talent,
  note: entry.note,
  savedAt: entry.savedAt.toISOString(),
  updatedAt: entry.updatedAt.toISOString(),
});

const pageAfter = (cursor: string | undefined) => {
  const after = decodeCursor(cursor);
  return after ? { savedAt: after.at, talentId: after.id } : null;
};

export class ListShortlistQuery {
  constructor(
    private readonly entries: ShortlistRepository,
    private readonly accounts: ShortlistAccounts,
    private readonly talents: ShortlistTalents,
  ) {}

  async execute(agentId: string, cursor?: string): Promise<Result<ShortlistPage, DomainError>> {
    const refused = await ensureAgent(this.accounts, agentId, false);
    if (refused) return err(refused);
    const [rows, saved] = await Promise.all([
      this.entries.page(agentId, pageAfter(cursor), SHORTLIST_PAGE_SIZE + 1),
      this.entries.count(agentId),
    ]);
    const page = rows.slice(0, SHORTLIST_PAGE_SIZE);
    const cards = await Promise.all(page.map((entry) => this.talents.cardFor(entry.talentId)));
    const last = page.at(-1);
    return ok({
      items: page.flatMap((entry, index) => {
        const card = cards[index];
        return card ? [view(entry, card)] : [];
      }),
      saved,
      max: SHORTLIST_MAX,
      nextCursor:
        rows.length > SHORTLIST_PAGE_SIZE && last
          ? encodeCursor(last.savedAt, last.talentId)
          : null,
    });
  }
}

export class GetShortlistEntryQuery {
  constructor(
    private readonly entries: ShortlistRepository,
    private readonly accounts: ShortlistAccounts,
    private readonly talents: ShortlistTalents,
  ) {}

  async execute(agentId: string, handle: string): Promise<Result<ShortlistEntryView, DomainError>> {
    const refused = await ensureAgent(this.accounts, agentId, false);
    if (refused) return err(refused);
    const talentId = await this.talents.visibleUserId(handle);
    const entry = talentId ? await this.entries.find(agentId, talentId) : null;
    const card = entry ? await this.talents.cardFor(entry.talentId) : null;
    return entry && card ? ok(view(entry, card)) : err(ShortlistErrors.notSaved());
  }
}

export class SaveToShortlistHandler {
  constructor(
    private readonly entries: ShortlistRepository,
    private readonly accounts: ShortlistAccounts,
    private readonly talents: ShortlistTalents,
    private readonly clock: Clock,
  ) {}

  async execute(
    agentId: string,
    handle: string,
    input: SaveToShortlist,
  ): Promise<Result<ShortlistEntryView, DomainError>> {
    const refused = await ensureAgent(this.accounts, agentId, true);
    if (refused) return err(refused);
    const talentId = await this.talents.visibleUserId(handle);
    const card = talentId ? await this.talents.cardFor(talentId) : null;
    if (!talentId || !card) return err(ShortlistErrors.notFound());

    const existing = await this.entries.find(agentId, talentId);
    // The limit counts new saves only; changing a note on a full list still works.
    if (!existing && (await this.entries.count(agentId)) >= SHORTLIST_MAX) {
      return err(ShortlistErrors.full());
    }
    const now = this.clock.now();
    const saved = await this.entries.save({
      agentId,
      talentId,
      note: input.note ?? existing?.note ?? '',
      savedAt: existing?.savedAt ?? now,
      updatedAt: now,
    });
    return ok(view(saved, card));
  }
}

/** Works for talent who are hidden now, so an agent can always tidy their own list. */
export class RemoveFromShortlistHandler {
  constructor(
    private readonly entries: ShortlistRepository,
    private readonly accounts: ShortlistAccounts,
    private readonly talents: ShortlistTalents,
  ) {}

  async execute(agentId: string, handle: string): Promise<Result<void, DomainError>> {
    const refused = await ensureAgent(this.accounts, agentId, false);
    if (refused) return err(refused);
    const talentId = await this.talents.userIdOf(handle);
    if (talentId) await this.entries.remove(agentId, talentId);
    return ok(undefined);
  }
}

/** The agent's own shortlist for their data export (ADR-027). */
export class ShortlistExport {
  constructor(
    private readonly entries: ShortlistRepository,
    private readonly talents: ShortlistTalents,
  ) {}

  async forAgent(agentId: string): Promise<DataExport['shortlist']> {
    const rows = await this.entries.all(agentId);
    return Promise.all(
      rows.map(async (entry) => ({
        handle: await this.talents.handleOf(entry.talentId),
        note: entry.note,
        savedAt: entry.savedAt.toISOString(),
      })),
    );
  }
}
