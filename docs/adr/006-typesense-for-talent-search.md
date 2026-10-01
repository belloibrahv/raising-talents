# ADR-006: Typesense for talent search

Status: Accepted

## Context

Agents search talent by name, skills, category, location and filters. Postgres full-text lacks typo tolerance and fast faceting.

## Decision

Typesense as the search index, fed from domain events. Postgres stays the source of truth.

## Alternatives considered

Algolia; Postgres full-text; Elasticsearch.

## Consequences

Typo tolerance and facets out of the box at a lower cost than Algolia. The index can always be rebuilt from Postgres.
