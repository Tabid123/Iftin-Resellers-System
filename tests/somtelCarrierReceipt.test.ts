import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isSomtelConfirmedGiftReceipt } from '../supabase/functions/activate-package/somtelReceipt';

const actual = 'Macmiil, waxaad ku guuleysatay inaad Daily ugu shubto 629535029.\nWaad ku mahadsantahay isticmaalka adeegyada Somtel! | OK';

describe('Somtel Social Daily delivery confirmation', () => {
  it('recognizes actual Somtel success for exact receiver despite Android timeout', () => {
    expect(isSomtelConfirmedGiftReceipt(actual, '252629535029')).toBe(true);
    expect(isSomtelConfirmedGiftReceipt(actual, '629535029')).toBe(true);
    expect(isSomtelConfirmedGiftReceipt(actual.replace('guuleysatay', 'guulaysatay'), '629535029')).toBe(true);
  });

  it('rejects generic MMI, stale other receiver and altered success text', () => {
    expect(isSomtelConfirmedGiftReceipt('MMI complete | OK', '629535029')).toBe(false);
    expect(isSomtelConfirmedGiftReceipt(actual, '629535028')).toBe(false);
    expect(isSomtelConfirmedGiftReceipt('USSD processing | 629535029', '629535029')).toBe(false);
    expect(isSomtelConfirmedGiftReceipt('Macmiil, waad ku mahadsantahay adeegyada Somtel! | OK', '629535029')).toBe(false);
    expect(isSomtelConfirmedGiftReceipt('Macmiil, waxaad ku guuleysatay inaad Daily ugu shubto 629535029.', 'not-a-phone')).toBe(false);
  });

  it('is actually used by the edge handler, including the original missing spelling', () => {
    const src = readFileSync(new URL('../supabase/functions/activate-package/index.ts', import.meta.url), 'utf8');
    expect(src).toContain("'ku guulaysatay', 'ku guuleysatay'");
    expect(src).toContain('isSomtelConfirmedGiftReceipt(providerResponse, existingQueue.receiver_phone)');
    expect(src).toContain('(successKeywords.some(k => text.includes(k)) || confirmedSomtelGift)');
    expect(src).toContain('if (existingDelivered)');
    expect(src).toContain("normalizedStatus = 'verification_required'");
  });
});
