export interface DateParts {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

/** Digits only, cut to the length of a day or a year. */
export function digitsOnly(raw: string, length: number): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

/**
 * Day, month and year as the API's YYYY-MM-DD. The three are asked for separately because
 * the order of a typed date differs between countries. Returns null for anything that is
 * not a real calendar date. The age rule itself is enforced by the API, which is the only
 * place it can be trusted.
 */
export function toIsoDate(parts: DateParts): string | null {
  if (!/^\d{1,2}$/.test(parts.day) || !/^\d{1,2}$/.test(parts.month)) return null;
  if (!/^\d{4}$/.test(parts.year)) return null;
  const [day, month, year] = [Number(parts.day), Number(parts.month), Number(parts.year)];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real || year < 1900) return null;
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** January to December in the device's language. */
export function monthNames(locale?: string): readonly string[] {
  const format = new Intl.DateTimeFormat(locale ?? 'en', { month: 'long', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, month) =>
    format.format(new Date(Date.UTC(2001, month, 1))),
  );
}
