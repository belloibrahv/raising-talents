import type { AccountStatus, ImageUrls, PublicTalentProfile, Role } from '@rt/contracts';
import type { TalentDocument } from '../domain/talent-document.js';

export interface IndexQuery {
  /** Empty means everything, newest first. */
  readonly text: string;
  readonly category?: string | undefined;
  readonly subcategories: readonly string[];
  readonly cities: readonly string[];
  readonly skills: readonly string[];
  readonly gender?: string | undefined;
  readonly bornOnFrom?: number | undefined;
  readonly bornOnTo?: number | undefined;
  readonly page: number;
  readonly perPage: number;
}

export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

export interface IndexResult {
  readonly hits: readonly TalentDocument[];
  readonly found: number;
  readonly facets: {
    readonly category: readonly FacetCount[];
    readonly city: readonly FacetCount[];
  };
}

/** The search engine (ADR-006). Typesense in every real environment. */
export interface SearchIndex {
  readonly enabled: boolean;
  upsert(document: TalentDocument): Promise<void>;
  /** Removing someone who is not there is not an error. */
  remove(id: string): Promise<void>;
  search(query: IndexQuery): Promise<IndexResult>;
  /** Builds a fresh index from every batch, then swaps it in; searches keep working meanwhile. */
  rebuild(batches: AsyncIterable<readonly TalentDocument[]>): Promise<number>;
}

/** What search needs from talent profiles. Implemented by TalentDirectory. */
export interface SearchTalents {
  searchable(
    userId: string,
  ): Promise<{ userId: string; profile: PublicTalentProfile; updatedAt: Date } | null>;
  completeUserIds(pageSize?: number): AsyncIterable<readonly string[]>;
}

/** What search needs from accounts. Implemented by AccountsFacade. */
export interface SearchAccounts {
  indexFacts(userId: string): Promise<{ status: AccountStatus; dateOfBirth: string } | null>;
  profileContext(userId: string): Promise<{ role: Role | null; status: AccountStatus } | null>;
}

export type AvatarUrls = (ownerId: string, mediaId: string) => ImageUrls;
