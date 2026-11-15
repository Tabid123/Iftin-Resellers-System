import { describe, expect, it } from 'vitest';
import { getAllowedPrefixes, matchesAllowedPrefix, formatPrefixes } from '@/lib/phonePrefixes';

describe('Somlink receiver number validation shared by all tenants', () => {
  it('allows only prefix 64 even with legacy tenant settings', () => {
    expect(getAllowedPrefixes('Somlink')).toEqual(['64']);
    expect(getAllowedPrefixes('SOMLINK')).toEqual(['64']);
    expect(getAllowedPrefixes('Somlink', '63,65')).toEqual(['64']);
    expect(matchesAllowedPrefix('640000000', getAllowedPrefixes('Somlink'))).toBe(true);
    expect(matchesAllowedPrefix('630000000', getAllowedPrefixes('Somlink'))).toBe(false);
    expect(matchesAllowedPrefix('650000000', getAllowedPrefixes('Somlink'))).toBe(false);
    expect(formatPrefixes(getAllowedPrefixes('Somlink'))).toBe('64');
  });
  it('does not change other networks and their payment sender validation', () => {
    expect(getAllowedPrefixes('Hormuud')).toEqual(['61', '77']);
    expect(getAllowedPrefixes('Somtel')).toEqual(['62']);
    expect(getAllowedPrefixes('Somnet')).toEqual(['68']);
    expect(getAllowedPrefixes('Telesom')).toEqual(['63']);
    expect(getAllowedPrefixes('Amtel')).toEqual(['71']);
  });
});
