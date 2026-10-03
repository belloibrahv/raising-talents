import type { TalentDocument } from '../domain/talent-document.js';
import type { IndexQuery, IndexResult, SearchIndex } from '../application/ports.js';

/** Filters like Typesense does, with a plain substring match for text. Good enough for use case tests. */
export class InMemorySearchIndex implements SearchIndex {
  readonly enabled = true;
  readonly documents = new Map<string, TalentDocument>();
  rebuilds = 0;

  async upsert(document: TalentDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  async remove(id: string): Promise<void> {
    this.documents.delete(id);
  }

  async search(query: IndexQuery): Promise<IndexResult> {
    const text = query.text.trim().toLowerCase();
    const matches = [...this.documents.values()]
      .filter(
        (doc) =>
          !text ||
          [
            doc.display_name,
            doc.handle,
            ...doc.skill_names,
            ...doc.subcategory_names,
            doc.category_name,
            doc.city_name,
            doc.bio,
          ].some((field) => field.toLowerCase().includes(text)),
      )
      .filter((doc) => !query.category || doc.category === query.category)
      .filter(
        (doc) =>
          query.subcategories.length === 0 ||
          doc.subcategories.some((slug) => query.subcategories.includes(slug)),
      )
      .filter((doc) => query.cities.length === 0 || query.cities.includes(doc.city))
      .filter(
        (doc) =>
          query.skills.length === 0 || doc.skills.some((slug) => query.skills.includes(slug)),
      )
      .filter((doc) => !query.gender || doc.gender === query.gender)
      .filter(
        (doc) =>
          query.bornOnFrom === undefined ||
          (doc.born_on !== undefined && doc.born_on >= query.bornOnFrom),
      )
      .filter(
        (doc) =>
          query.bornOnTo === undefined ||
          (doc.born_on !== undefined && doc.born_on <= query.bornOnTo),
      )
      .sort((a, b) => b.updated_at - a.updated_at);
    const count = (field: 'category' | 'city') => {
      const counts = new Map<string, number>();
      for (const doc of matches) counts.set(doc[field], (counts.get(doc[field]) ?? 0) + 1);
      return [...counts.entries()].map(([value, total]) => ({ value, count: total }));
    };
    const start = (query.page - 1) * query.perPage;
    return {
      hits: matches.slice(start, start + query.perPage),
      found: matches.length,
      facets: { category: count('category'), city: count('city') },
    };
  }

  async rebuild(batches: AsyncIterable<readonly TalentDocument[]>): Promise<number> {
    this.rebuilds += 1;
    this.documents.clear();
    for await (const batch of batches) for (const doc of batch) this.documents.set(doc.id, doc);
    return this.documents.size;
  }
}
