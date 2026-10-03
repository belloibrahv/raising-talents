import { describe, expect, it } from 'vitest';
import { ageFromDay, bornOnRange, dayNumber } from './talent-document.js';

const today = new Date('2026-10-02T12:00:00.000Z');
const age = (isoDate: string) => ageFromDay(dayNumber(isoDate), today);
const within = (isoDate: string, range: { from?: number; to?: number }) => {
  const day = dayNumber(isoDate);
  return (
    (range.from === undefined || day >= range.from) && (range.to === undefined || day <= range.to)
  );
};

describe('age filters', () => {
  it('turns birthdays into whole years, counting a birthday today', () => {
    expect(age('2008-10-02')).toBe(18);
    expect(age('2008-10-03')).toBe(17);
    expect(age('1996-06-14')).toBe(30);
  });

  it('includes exactly the people whose age is in the range, at both edges', () => {
    const range = bornOnRange({ min: 18, max: 25 }, today);
    expect(within('2008-10-02', range)).toBe(true); // 18 today
    expect(within('2008-10-03', range)).toBe(false); // 17, 18 tomorrow
    expect(within('2000-10-03', range)).toBe(true); // 25, 26 tomorrow
    expect(within('2000-10-02', range)).toBe(false); // 26 today
  });

  it('agrees with ageFromDay for every day across two years', () => {
    const range = bornOnRange({ min: 21, max: 23 }, today);
    for (let offset = 0; offset < 730; offset += 1) {
      const birth = new Date(Date.UTC(2002, 0, 1 + offset)).toISOString().slice(0, 10);
      const years = age(birth);
      expect(within(birth, range)).toBe(years >= 21 && years <= 23);
    }
  });

  it('handles 29 February on both sides', () => {
    const leapDay = new Date('2028-02-29T09:00:00.000Z');
    expect(ageFromDay(dayNumber('2010-02-28'), leapDay)).toBe(18);
    const range = bornOnRange({ min: 18 }, leapDay);
    expect(within('2010-02-28', range)).toBe(true);
    expect(within('2010-03-01', range)).toBe(false);
  });

  it('leaves an open end open', () => {
    expect(bornOnRange({}, today)).toEqual({});
    expect(bornOnRange({ min: 30 }, today).from).toBeUndefined();
  });
});
