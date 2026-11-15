import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidSomlinkReceiverPhone, somlinkLogin, somlinkSendData } from '../supabase/functions/_shared/somlink';

afterEach(() => { vi.unstubAllGlobals(); });

describe('Somlink numeric wallet phone authentication', () => {
  it('sends the wallet phone for login and delivery exactly as the provider API expects', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(options.body)) });
      return new Response(JSON.stringify(String(url).includes('/auth/')
        ? { token: 'synthetic-access-token' }
        : { code: 200, message: 'DATA_PAID_SUCCESSFULLY' }), { status: 200 });
    }));

    const login = await somlinkLogin('642403245', 'synthetic-password');
    await somlinkSendData({
      token: login.token,
      walletPhone: '642403245',
      receiverPhone: '640000000',
      amount: 0.5,
      bundleId: 20060,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].body).toEqual({ phone: '642403245', password: 'synthetic-password' });
    expect(calls[1].body.wallet_phone).toBe('642403245');
    expect(calls[1].body.data_phone).toBe('252640000000');
  });

  it('requires 64 prefix in Somlink destinations for all tenants', () => {
    expect(isValidSomlinkReceiverPhone('640000000')).toBe(true);
    expect(isValidSomlinkReceiverPhone('+252640000000')).toBe(true);
    expect(isValidSomlinkReceiverPhone('252640000000')).toBe(true);
    expect(isValidSomlinkReceiverPhone('630000000')).toBe(false);
    expect(isValidSomlinkReceiverPhone('650000000')).toBe(false);
    expect(isValidSomlinkReceiverPhone('620000000')).toBe(false);
    expect(isValidSomlinkReceiverPhone('64')).toBe(false);
    expect(isValidSomlinkReceiverPhone('252630000000')).toBe(false);
  });

  it('blocks a non-64 destination before any paid API request', async () => {
    const fakeFetch = vi.fn();
    vi.stubGlobal('fetch', fakeFetch);
    await expect(somlinkSendData({
      token: 'synthetic-token',
      walletPhone: '642403245',
      receiverPhone: '650000000',
      amount: 0.5,
      bundleId: 20060,
    })).rejects.toThrow('Somlink receiver phone must start with 64');
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('rejects non-numeric wallet IDs before any paid delivery request', async () => {
    const fakeFetch = vi.fn();
    vi.stubGlobal('fetch', fakeFetch);
    await expect(somlinkSendData({
      token: 'synthetic-token',
      walletPhone: 'FAANOOLEAPI',
      receiverPhone: '640000000',
      amount: 0.5,
      bundleId: 20060,
    })).rejects.toThrow('Invalid Somlink wallet phone');
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
