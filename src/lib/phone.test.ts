import { describe, expect, it } from 'vitest';
import { formatBDNumber, normalizeBDNumber, toAsciiDigits } from './phone';

const E164 = '+8801712345678';

describe('toAsciiDigits', () => {
  it('converts Bangla numerals', () => {
    expect(toAsciiDigits('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
  });
  it('leaves other characters alone', () => {
    expect(toAsciiDigits('+880 ১৭')).toBe('+880 17');
  });
});

describe('normalizeBDNumber', () => {
  it.each([
    ['01712345678'],
    ['8801712345678'],
    ['+8801712345678'],
    ['008801712345678'],
    ['01712-345678'],
    ['(017) 1234 5678'],
    ['+880 1712.345.678'],
    ['০১৭১২৩৪৫৬৭৮'],
    ['+৮৮০ ১৭১২-৩৪৫৬৭৮'],
    ['  01712345678  '],
  ])('normalizes %s', (input) => {
    expect(normalizeBDNumber(input)).toEqual({ ok: true, e164: E164 });
  });

  it.each([
    ['', 'empty'],
    ['0171234567', 'too short'],
    ['017123456789', 'too long'],
    ['01212345678', 'invalid operator prefix'],
    ['+14155552671', 'non-BD number'],
    ['+447911123456', 'non-BD number'],
    ['0171234abcd', 'letters'],
    ['029123456', 'Dhaka landline'],
  ])('rejects %s (%s)', (input) => {
    const result = normalizeBDNumber(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });

  it('accepts every mobile operator prefix 013-019', () => {
    for (const p of ['3', '4', '5', '6', '7', '8', '9']) {
      expect(normalizeBDNumber(`01${p}12345678`)).toEqual({ ok: true, e164: `+8801${p}12345678` });
    }
  });
});

describe('formatBDNumber', () => {
  it('formats in national style', () => {
    expect(formatBDNumber(E164)).toBe('01712-345678');
  });
  it('returns unknown input unchanged', () => {
    expect(formatBDNumber('+14155552671')).toBe('+14155552671');
  });
});
