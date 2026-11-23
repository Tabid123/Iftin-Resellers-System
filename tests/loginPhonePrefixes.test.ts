import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidLoginPhone, LOGIN_PHONE_PREFIXES } from '../src/lib/loginPhone';

describe('customer app login prefixes', () => {
  it.each(['63', '90', '65'])('accepts %s after the nine-digit phone is complete', (prefix) => {
    expect(isValidLoginPhone(prefix + '1234567')).toBe(true);
  });

  it.each(['61', '77', '62', '68', '71', '64'])('keeps the previous %s prefix available', (prefix) => {
    expect(isValidLoginPhone(prefix + '1234567')).toBe(true);
  });

  it('rejects short, long, non-numeric and unknown prefix values', () => {
    for (const value of ['63123456', '9012345678', '65123456x', '991234567', '', '+252631234567']) {
      expect(isValidLoginPhone(value)).toBe(false);
    }
    expect(LOGIN_PHONE_PREFIXES).toHaveLength(9);
  });

  it('uses the same login prefix list for verification and stored sessions', () => {
    const input = readFileSync(new URL('../src/components/PhoneInput.tsx', import.meta.url), 'utf8');
    const verify = readFileSync(new URL('../src/components/PhoneVerification.tsx', import.meta.url), 'utf8');
    const stored = readFileSync(new URL('../src/lib/verifiedPhone.ts', import.meta.url), 'utf8');
    expect(input).toContain('isValidLoginPhone(phoneNumber)');
    expect(verify).toContain('isValidLoginPhone(phoneNumber)');
    expect(stored).toContain('export const SOMALI_PHONE_RE = LOGIN_PHONE_RE');
    expect(input).not.toContain("const allowedPrefixes = ['61', '77', '62', '68']");
  });
});
