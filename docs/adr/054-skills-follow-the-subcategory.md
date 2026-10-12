# ADR-054: Skills follow the subcategory

- Status: Accepted
- Date: 2026-10-12
- Changes: ADR-019, ADR-046 (the skills list)

## Context

Skills belonged to a category. A boxer was offered "Goalkeeping" and "Set pieces" because
they are sports skills, and a DJ was offered "Vocals". The client asked for skills that
relate to the subcategory the talent chose.

## Decision

- **A link table.** `taxonomy.skill_subcategories (skill_slug, subcategory_slug)`. A skill
  with rows there is offered only to talent who chose one of those subcategories. A skill
  can belong to several: "Goalkeeping" to football, hockey and ice hockey.
- **Skills with no rows** keep the old meaning: the whole category, or everyone when the
  skill has no category. Languages stay open to everyone.
- **The list.** Migration 0032 adds 218 skills and links every skill except languages:
  each of the 85 subcategories has its own short list (positions and strokes for sports,
  instruments and styles for music, formats for creators, and so on). "Other" subcategories
  get the general skills of their category.
- **The API.** `GET /v1/taxonomy` gives each skill its `subcategorySlugs`. A profile update
  that names a skill which does not fit is refused, as before. An update that changes the
  subcategories without naming skills drops the skills that no longer fit, so nobody is
  stuck with a profile they cannot save.
- **The form.** Skills appear once a subcategory is chosen, the matching ones first and
  languages last. The limit stays at 15.

## Consequences

- A profile saved before this may still show a skill that no longer fits its subcategory.
  It is dropped the next time the talent saves their discipline.
- The list is content, not code: more skills or links are one more migration.
