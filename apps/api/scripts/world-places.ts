// Builds the countries and cities migration from a GeoNames download (ADR-046).
//
//   curl -LO https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
//   curl -LO https://download.geonames.org/export/dump/countryInfo.txt
//   curl -LO https://download.geonames.org/export/dump/admin1CodesASCII.txt
//   pnpm exec tsx scripts/world-places.ts <folder with those files> > drizzle/<migration>.sql
//
// GeoNames data is CC BY 4.0 (https://www.geonames.org). A city is kept when it has 100,000
// people or more, is a capital, is a regional capital of 50,000 or more, or is one of its
// country's ten largest, so every country has somewhere to pick.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const folder = process.argv[2];
if (!folder) {
  process.stderr.write(`Usage: tsx scripts/world-places.ts <geonames folder>\n`);
  process.exit(1);
}

const rows = (file: string): string[][] =>
  readFileSync(join(folder, file), 'utf8')
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('\t'));

/** Shorter or more familiar names than GeoNames uses. */
const NAME_OVERRIDES: Record<string, string> = {
  PS: 'Palestine',
  TL: 'Timor-Leste',
  VA: 'Vatican City',
  MO: 'Macau',
};

/** Other words people type for a country, so "UK" or "England" finds the United Kingdom. */
const SEARCH_TERMS: Record<string, string> = {
  GB: 'UK, U.K., England, Scotland, Wales, Northern Ireland, Britain, Great Britain',
  US: 'USA, U.S., U.S.A., America, United States of America',
  AE: 'UAE, Emirates, Dubai',
  CD: 'DRC, DR Congo, Congo-Kinshasa',
  CG: 'Congo-Brazzaville',
  CI: "Côte d'Ivoire, Cote d'Ivoire",
  CZ: 'Czech Republic',
  KR: 'Korea',
  NL: 'Holland',
  SZ: 'Swaziland',
  MM: 'Burma',
  CV: 'Cape Verde',
  MK: 'Macedonia',
  TR: 'Türkiye, Turkiye',
  RU: 'Russian Federation',
  ZA: 'SA',
  NG: 'Naija',
  SA: 'KSA',
  DE: 'Deutschland',
  ES: 'España',
};

const sql = (value: string | null) =>
  value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`;
const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const regions = new Map(
  rows('admin1CodesASCII.txt').map(([code = '', name = '']) => [code, name] as const),
);

interface City {
  id: string;
  name: string;
  ascii: string;
  latitude: number;
  longitude: number;
  featureCode: string;
  country: string;
  region: string | null;
  population: number;
}

// geonameid, name, asciiname, alternatenames, latitude, longitude, feature class,
// feature code, country code, cc2, admin1, admin2, admin3, admin4, population, ...
const byCountry = new Map<string, City[]>();
for (const row of rows('cities15000.txt')) {
  const [id = '', name = '', ascii = '', , latitude, longitude, , featureCode = '', country = ''] =
    row;
  const city: City = {
    id,
    name,
    ascii: ascii || name,
    latitude: Number(latitude),
    longitude: Number(longitude),
    featureCode,
    country,
    region: regions.get(`${country}.${row[10] ?? ''}`) ?? null,
    population: Number(row[14]) || 0,
  };
  if (!slugify(city.ascii)) continue;
  const list = byCountry.get(city.country) ?? [];
  list.push(city);
  byCountry.set(city.country, list);
}

const kept: (City & { slug: string })[] = [];
for (const [, list] of byCountry) {
  list.sort((a, b) => b.population - a.population || a.ascii.localeCompare(b.ascii));
  const slugs = new Set<string>();
  list.forEach((city, rank) => {
    const keep =
      city.population >= 100_000 ||
      rank < 10 ||
      city.featureCode === 'PPLC' ||
      (city.featureCode === 'PPLA' && city.population >= 50_000);
    if (!keep) return;
    // The largest place keeps the plain name; a smaller namesake adds its region.
    const base = `${city.country.toLowerCase()}-${slugify(city.ascii)}`;
    let slug = base;
    if (slugs.has(slug) && city.region) slug = `${base}-${slugify(city.region)}`;
    if (slugs.has(slug)) slug = `${base}-${city.id}`;
    slugs.add(slug);
    kept.push({ ...city, slug: slug.slice(0, 64) });
  });
}

const countries = rows('countryInfo.txt')
  .map(([code = '', , , , name = '']) => ({ code, name: NAME_OVERRIDES[code] ?? name }))
  .filter((country) => byCountry.has(country.code))
  .sort((a, b) => a.name.localeCompare(b.name));

const out: string[] = [];
out.push(
  '-- Countries and cities from GeoNames (CC BY 4.0, https://www.geonames.org), built by',
  '-- scripts/world-places.ts (ADR-046). Existing slugs keep their rows and gain the new facts.',
  '',
);
out.push('INSERT INTO "taxonomy"."countries" ("code", "name", "search_terms") VALUES');
out.push(
  countries
    .map((c) => `  (${sql(c.code)}, ${sql(c.name)}, ${sql(SEARCH_TERMS[c.code] ?? '')})`)
    .join(',\n'),
);
out.push(
  'ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "search_terms" = EXCLUDED."search_terms";',
);
const CHUNK = 1000;
for (let start = 0; start < kept.length; start += CHUNK) {
  out.push('--> statement-breakpoint');
  out.push(
    'INSERT INTO "taxonomy"."cities" ("slug", "name", "country_code", "region", "population", "latitude", "longitude") VALUES',
  );
  out.push(
    kept
      .slice(start, start + CHUNK)
      .map(
        (c) =>
          `  (${sql(c.slug)}, ${sql(c.name)}, ${sql(c.country)}, ${sql(c.region)}, ${String(c.population)}, ${String(c.latitude)}, ${String(c.longitude)})`,
      )
      .join(',\n'),
  );
  out.push(
    'ON CONFLICT ("slug") DO UPDATE SET "region" = EXCLUDED."region", "population" = EXCLUDED."population";',
  );
}
process.stdout.write(`${out.join('\n')}\n`);
process.stderr.write(`${String(countries.length)} countries, ${String(kept.length)} cities\n`);
