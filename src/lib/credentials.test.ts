import { describe, expect, it } from 'vitest';
import { emailSchema, passwordSchema } from './credentials';

describe('emailSchema', () => {
  it('trims and lowercases', () => {
    expect(emailSchema.parse('  Rahim@Example.COM ')).toBe('rahim@example.com');
  });

  it.each(['', 'rahim', 'rahim@', '@example.com', 'rahim example@x.com'])('rejects %j', (input) => {
    const result = emailSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Enter a valid email address.');
  });
});

describe('passwordSchema', () => {
  it('requires 8 to 72 characters', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false);
  });
});
