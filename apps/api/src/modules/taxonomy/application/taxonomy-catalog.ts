import type { NamedRef, TaxonomyResponse } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { domainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';

export interface TaxonomySnapshot {
  readonly categories: readonly { slug: string; name: string }[];
  readonly subcategories: readonly { slug: string; name: string; categorySlug: string }[];
  readonly skills: readonly { slug: string; name: string; categorySlug: string | null }[];
  readonly cities: readonly { slug: string; name: string; countryCode: string }[];
}

export interface TalentSelection {
  readonly categorySlug: string | null;
  readonly subcategorySlugs: readonly string[];
  readonly skillSlugs: readonly string[];
  readonly citySlug: string | null;
}

const unknown = (detail: string): DomainError => domainError('UNKNOWN_TAXONOMY', detail);

/**
 * An in-memory view of the reference lists. Validation and name lookups run
 * against it, so a profile update never needs extra queries.
 */
export class TaxonomyCatalog {
  private readonly categories: Map<string, { slug: string; name: string }>;
  private readonly subcategories: Map<string, { slug: string; name: string; categorySlug: string }>;
  private readonly skills: Map<string, { slug: string; name: string; categorySlug: string | null }>;
  private readonly cities: Map<string, { slug: string; name: string; countryCode: string }>;

  constructor(private readonly snapshot: TaxonomySnapshot) {
    this.categories = new Map(snapshot.categories.map((item) => [item.slug, item]));
    this.subcategories = new Map(snapshot.subcategories.map((item) => [item.slug, item]));
    this.skills = new Map(snapshot.skills.map((item) => [item.slug, item]));
    this.cities = new Map(snapshot.cities.map((item) => [item.slug, item]));
  }

  validateTalentSelection(selection: TalentSelection): Result<void, DomainError> {
    if (selection.categorySlug !== null && !this.categories.has(selection.categorySlug)) {
      return err(unknown(`There is no category "${selection.categorySlug}".`));
    }
    for (const slug of selection.subcategorySlugs) {
      const subcategory = this.subcategories.get(slug);
      if (!subcategory) return err(unknown(`There is no subcategory "${slug}".`));
      if (subcategory.categorySlug !== selection.categorySlug) {
        return err(unknown(`"${slug}" does not belong to the chosen category.`));
      }
    }
    for (const slug of selection.skillSlugs) {
      const skill = this.skills.get(slug);
      if (!skill) return err(unknown(`There is no skill "${slug}".`));
      if (skill.categorySlug !== null && skill.categorySlug !== selection.categorySlug) {
        return err(unknown(`"${slug}" is not a skill for the chosen category.`));
      }
    }
    return this.validateCity(selection.citySlug);
  }

  validateCategories(slugs: readonly string[]): Result<void, DomainError> {
    const missing = slugs.find((slug) => !this.categories.has(slug));
    return missing ? err(unknown(`There is no category "${missing}".`)) : ok(undefined);
  }

  validateCity(slug: string | null): Result<void, DomainError> {
    return slug !== null && !this.cities.has(slug)
      ? err(unknown(`There is no city "${slug}".`))
      : ok(undefined);
  }

  category(slug: string | null): NamedRef | null {
    const found = slug === null ? undefined : this.categories.get(slug);
    return found ? { slug: found.slug, name: found.name } : null;
  }

  subcategoryRefs(slugs: readonly string[]): NamedRef[] {
    return slugs.flatMap((slug) => {
      const found = this.subcategories.get(slug);
      return found ? [{ slug: found.slug, name: found.name }] : [];
    });
  }

  skillRefs(slugs: readonly string[]): NamedRef[] {
    return slugs.flatMap((slug) => {
      const found = this.skills.get(slug);
      return found ? [{ slug: found.slug, name: found.name }] : [];
    });
  }

  categoryRefs(slugs: readonly string[]): NamedRef[] {
    return slugs.flatMap((slug) => {
      const found = this.categories.get(slug);
      return found ? [{ slug: found.slug, name: found.name }] : [];
    });
  }

  city(slug: string | null): (NamedRef & { countryCode: string }) | null {
    const found = slug === null ? undefined : this.cities.get(slug);
    return found ? { slug: found.slug, name: found.name, countryCode: found.countryCode } : null;
  }

  toResponse(): TaxonomyResponse {
    return {
      categories: this.snapshot.categories.map((category) => ({
        slug: category.slug,
        name: category.name,
        subcategories: this.snapshot.subcategories
          .filter((subcategory) => subcategory.categorySlug === category.slug)
          .map(({ slug, name }) => ({ slug, name })),
      })),
      skills: this.snapshot.skills.map(({ slug, name, categorySlug }) => ({
        slug,
        name,
        categorySlug,
      })),
      cities: this.snapshot.cities.map(({ slug, name, countryCode }) => ({
        slug,
        name,
        countryCode,
      })),
    };
  }
}

/** Where the catalog comes from. Production reads Postgres and caches the result. */
export interface TaxonomySource {
  current(): Promise<TaxonomyCatalog>;
}
