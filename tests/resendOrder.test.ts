import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { resendOrder } from '@/lib/resendOrder';

// Synthetic records only: the test exercises the real resend entry point and
// query filters without sending a recharge or using a real customer's PIN.
const phone = '680000001';
const order = {
  provider_id: 'provider-a', provider_name: 'Somnet', package_id: 'package-a',
  package_name: 'Unlimited', cost_price: 0.35, selling_price: 0.32,
};
const packageRow = {
  id: 'package-a', provider_id: 'provider-a', category_id: 'category-a', ussd_code: null,
};
const categoryInstruction = {
  provider_id: 'provider-a', category_id: 'category-a', package_id: null,
  code_template: '*829*{receiver_phone}*{cost_price}*{sim_password}#',
  sim_password: '1234', ussd_code: null,
};

function mockDatabase(options: {
  instructions?: Record<string, unknown>[];
  packages?: Record<string, unknown>[];
  previous?: Record<string, unknown>[];
  errorTable?: string;
} = {}) {
  const rows: Record<string, Record<string, unknown>[]> = {
    data_packages_config: options.packages ?? [packageRow],
    delivery_instructions: options.instructions ?? [categoryInstruction],
    delivery_queue: options.previous ?? [],
  };
  const writes: { table: string; operation: string; values: any }[] = [];
  from.mockImplementation((table: string) => {
    let operation = 'select';
    let values: unknown;
    const filters: [string, unknown][] = [];
    const result = () => {
      if (table === options.errorTable) return { data: null, error: { message: 'Lookup unavailable' } };
      if (operation !== 'select') {
        writes.push({ table, operation, values });
        return { data: table === 'orders' ? { id: 'created-order' } : null, error: null };
      }
      const matches = (rows[table] ?? []).filter(row => filters.every(([key, value]) => row[key] === value));
      return { data: matches[0] ?? null, error: null };
    };
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      order: () => query,
      limit: () => query,
      maybeSingle: async () => result(),
      single: async () => result(),
      insert: (payload: unknown) => { operation = 'insert'; values = payload; return query; },
      update: (payload: unknown) => { operation = 'update'; values = payload; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return query;
  });
  return { writes, queued: () => writes.find(w => w.table === 'delivery_queue')?.values };
}

beforeEach(() => from.mockReset());

describe('unmatched payment USSD resolution', () => {
  it('uses the selected package category even though the picker supplies no category_id', async () => {
    const db = mockDatabase();
    expect(await resendOrder(order, `+252${phone}`)).toEqual({ ok: true, orderId: 'created-order' });
    expect(db.queued()).toMatchObject({ ussd_code: `*829*${phone}*035*1234#`, receiver_phone: phone, provider_name: 'Somnet' });
    expect(db.writes.map(w => w.table)).toEqual(['orders', 'delivery_queue']);
  });

  it('prefers a package instruction over category and provider defaults', async () => {
    const db = mockDatabase({ instructions: [
      categoryInstruction,
      { ...categoryInstruction, category_id: null, code_template: '*100*{receiver_phone}#' },
      { ...categoryInstruction, package_id: 'package-a', code_template: '*777*{receiver_phone}*{sim_password}#', sim_password: '5678' },
    ] });
    expect((await resendOrder(order, phone)).ok).toBe(true);
    expect(db.queued().ussd_code).toBe(`*777*${phone}*5678#`);
  });

  it('ignores another category, provider and package when choosing the category instruction', async () => {
    const db = mockDatabase({ instructions: [
      { ...categoryInstruction, category_id: 'category-other', code_template: '*111#' },
      { ...categoryInstruction, provider_id: 'provider-other', code_template: '*222#' },
      { ...categoryInstruction, package_id: 'package-other', code_template: '*333#' },
      { ...categoryInstruction, category_id: null, code_template: '*444#' },
      categoryInstruction,
    ] });
    expect((await resendOrder(order, phone)).ok).toBe(true);
    expect(db.queued().ussd_code).toBe(`*829*${phone}*035*1234#`);
  });

  it('falls back to the provider default when the category has no instruction', async () => {
    const db = mockDatabase({ instructions: [{ ...categoryInstruction, category_id: null }] });
    expect((await resendOrder(order, phone)).ok).toBe(true);
    expect(db.queued().ussd_code).toBe(`*829*${phone}*035*1234#`);
  });

  it('expands a direct package USSD fallback instead of queueing placeholders', async () => {
    const db = mockDatabase({ instructions: [], packages: [{ ...packageRow, ussd_code: '*123*{receiver_phone}*{cost_price}#' }] });
    expect((await resendOrder(order, phone)).ok).toBe(true);
    expect(db.queued().ussd_code).toBe(`*123*${phone}*035#`);
  });

  it('supports instructions saved in ussd_code', async () => {
    const db = mockDatabase({ instructions: [{ ...categoryInstruction, code_template: null, ussd_code: '*829*{receiver_phone}*{cost_price}*{sim_password}#' }] });
    expect((await resendOrder(order, phone)).ok).toBe(true);
    expect(db.queued().ussd_code).toBe(`*829*${phone}*035*1234#`);
  });

  it.each([[0.05, '005'], [0.1, '010'], [0.35, '035'], [4, '4'], [4.25, '4*25']])(
    'formats cost %s as %s for the carrier', async (cost, expected) => {
      const db = mockDatabase();
      expect((await resendOrder({ ...order, cost_price: cost }, phone)).ok).toBe(true);
      expect(db.queued().ussd_code).toBe(`*829*${phone}*${expected}*1234#`);
    },
  );

  it('does not create an order when a required PIN is missing', async () => {
    const db = mockDatabase({ instructions: [{ ...categoryInstruction, sim_password: null }] });
    expect(await resendOrder(order, phone)).toMatchObject({ ok: false, message: expect.stringContaining('PIN') });
    expect(db.writes).toEqual([]);
  });

  it('does not create an order with unresolved placeholders', async () => {
    const db = mockDatabase({ instructions: [{ ...categoryInstruction, code_template: '*829*{unknown}#' }] });
    expect((await resendOrder(order, phone)).ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it.each(['delivery_instructions', 'data_packages_config'])('reports a %s query failure without writing', async table => {
    const db = mockDatabase({ errorTable: table });
    expect(await resendOrder(order, phone)).toMatchObject({ ok: false, message: expect.stringContaining('lama soo akhrin') });
    expect(db.writes).toEqual([]);
  });

  it('still reports genuinely missing USSD without creating an order', async () => {
    const db = mockDatabase({ instructions: [] });
    expect(await resendOrder(order, phone)).toMatchObject({ ok: false, message: expect.stringContaining('USSD-ka xirmadan lama helin') });
    expect(db.writes).toEqual([]);
  });

  it('reuses an existing delivery and routing without creating another order', async () => {
    const db = mockDatabase({ previous: [{
      order_id: 'old-order', receiver_phone: '680000002', ussd_code: '*829*680000002*035*1234#',
      provider_name: 'Somnet', android_device_id: 'device-a', sim_slot: 2,
    }] });
    expect(await resendOrder({ ...order, id: 'old-order', receiver_phone: '680000002' }, phone)).toEqual({ ok: true, orderId: 'old-order' });
    expect(db.queued()).toMatchObject({ order_id: 'old-order', ussd_code: `*829*${phone}*035*1234#`, android_device_id: 'device-a', sim_slot: 2 });
    expect(db.writes.filter(w => w.table === 'orders').map(w => w.operation)).toEqual(['update']);
  });
});
