import { describe, expect, it } from 'vitest';
import { formatDateOfBirthInput, toIsoDate } from './date-of-birth';

describe('formatDateOfBirthInput', () => {
  it('adds slashes as digits arrive and ignores anything else', () => {
    expect(formatDateOfBirthInput('2')).toBe('2');
    expect(formatDateOfBirthInput('231')).toBe('23/1');
    expect(formatDateOfBirthInput('23111999')).toBe('23/11/1999');
    expect(formatDateOfBirthInput('23-11-1999 extra')).toBe('23/11/1999');
  });
});

describe('toIsoDate', () => {
  it('converts a real day-first date', () => {
    expect(toIsoDate('23/11/1999')).toBe('1999-11-23');
    expect(toIsoDate('29/02/2004')).toBe('2004-02-29');
  });

  it('rejects dates that do not exist or are incomplete', () => {
    expect(toIsoDate('31/04/2001')).toBeNull();
    expect(toIsoDate('29/02/2003')).toBeNull();
    expect(toIsoDate('11/23/1999')).toBeNull();
    expect(toIsoDate('23/11/99')).toBeNull();
  });
});
