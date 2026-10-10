import { describe, expect, it } from 'vitest';
import { digitsOnly, monthNames, toIsoDate } from './date-of-birth';

describe('digitsOnly', () => {
  it('keeps digits up to the length of the part', () => {
    expect(digitsOnly('2a3', 2)).toBe('23');
    expect(digitsOnly('19999', 4)).toBe('1999');
  });
});

describe('toIsoDate', () => {
  it('converts a real date, with or without leading zeros', () => {
    expect(toIsoDate({ day: '23', month: '11', year: '1999' })).toBe('1999-11-23');
    expect(toIsoDate({ day: '5', month: '2', year: '2004' })).toBe('2004-02-05');
    expect(toIsoDate({ day: '29', month: '2', year: '2004' })).toBe('2004-02-29');
  });

  it('rejects dates that do not exist or are incomplete', () => {
    expect(toIsoDate({ day: '31', month: '4', year: '2001' })).toBeNull();
    expect(toIsoDate({ day: '29', month: '2', year: '2003' })).toBeNull();
    expect(toIsoDate({ day: '23', month: '', year: '1999' })).toBeNull();
    expect(toIsoDate({ day: '23', month: '11', year: '99' })).toBeNull();
  });
});

describe('monthNames', () => {
  it('lists the twelve months in order', () => {
    const names = monthNames('en');
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('January');
    expect(names[11]).toBe('December');
  });
});
