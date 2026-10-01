/** Whole years between a YYYY-MM-DD birth date and a moment, using UTC calendar dates. */
export function ageInYears(dateOfBirth: string, on: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const birth = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    birth.getUTCFullYear() === year &&
    birth.getUTCMonth() === month - 1 &&
    birth.getUTCDate() === day;
  if (!isRealDate || birth > on) return null;

  let age = on.getUTCFullYear() - year;
  const beforeBirthday =
    on.getUTCMonth() < month - 1 || (on.getUTCMonth() === month - 1 && on.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}
