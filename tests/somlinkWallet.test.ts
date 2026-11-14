import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeSomlinkWalletIdentifier,
  somlinkLogin,
  somlinkSendData,
} from '../supabase/functions/_shared/somlink';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Somlink wallet account IDs', () => {
  it('preserves provider-issued text IDs without stripping or changing case', () => {
    expect(normalizeSomlinkWalletIdentifier('FAANOOLEAPI')).toBe('FAANOOLEAPI');
    expect(normalizeSomlinkWalletIdentifier('Faanoole_API-1')).toBe('Faanoole_API-1');
  });

  it('preserves legacy numeric wallet behavior', () => {
    expect(normalizeSomlinkWalletIdentifier('252642403245')).toBe('252642403245');
    expect(normalizeSomlinkWalletIdentifier('+252642403245')).toBe('252642403245');
  });

  it('sends provider-issued text wallet IDs to Somlink instead of an empty number', async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(options.body)) });
      if (String(url).includes('/auth/')) {
        return new Response(JSON.stringify({ token: 'synthetic-access-token' }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 200, message: 'DATA_PAID_SUCCESSFULLY' }), { status: 200 });
    }));

    const login = await somlinkLogin('FAANOOLEAPI', 'synthetic-password');
    await somlinkSendData({
      token: login.token,
      walletPhone: 'FAANOOLEAPI',
      receiverPhone: '640000000',
      amount: 0.5,
      bundleId: 20060,
    });

    expect(requests).toHaveLength(2);
    expect(requests[0].body.phone).toBe('FAANOOLEAPI');
    expect(requests[1].body.wallet_phone).toBe('FAANOOLEAPI');
    expect(requests[1].body.data_phone).toBe('252640000000');
  });
});
