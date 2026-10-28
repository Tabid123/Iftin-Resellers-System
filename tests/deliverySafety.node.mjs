import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { test } from 'node:test';
import { deliveryOutcome, needsLateEvidence, isFinalOrder } from '../supabase/functions/activate-package/deliverySafety.ts';

test('partial bundles remain executable until all required parts complete', () => {
  assert.equal(deliveryOutcome(['completed', 'scheduled']), 'queued');
  assert.equal(deliveryOutcome(['completed', 'processing']), 'processing');
  assert.equal(deliveryOutcome(['completed', 'verification_required']), 'verification_required');
  assert.equal(deliveryOutcome(['completed', 'failed']), 'failed');
  assert.equal(deliveryOutcome(['completed', 'cancelled']), 'delivered');
});

const source = readFileSync(new URL('../supabase/functions/activate-package/index.ts', import.meta.url), 'utf8');
function handlerFor(queue, parent = { status: 'paid', delivery_status: 'verification_required' }) {
  const updates = [];
  let handler;
  const db = {
    rpc: async () => ({ data: { expired: 0 }, error: null }),
    from(table) {
      let update;
      const q = {
        select() { return q; }, eq() { return q; }, neq() { return q; }, in() { return q; },
        gte() { return q; }, order() { return q; }, limit() { return q; }, is() { return q; },
        update(data) { update = data; updates.push({ table, data }); return q; },
        maybeSingle: async () => {
          if (table === 'android_devices') return { data: { tenant_id: 'tenant-a', device_id: 'device-a' } };
          if (table === 'orders') return { data: parent };
          if (table === 'delivery_queue') {
            if (update) return { data: { ...queue, ...update } };
            return { data: { ...queue, attempts: 0 } };
          }
          return { data: null };
        },
        then(resolve) {
          let data = [];
          if (table === 'delivery_queue') data = [{ status: 'completed' }];
          resolve({ data, error: null });
        },
      };
      return q;
    },
  };
  const code = source.replace(/^import .*;\n/gm, '');
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, URL, Response, Request, Date,
    serve: fn => { handler = fn; }, createClient: () => db,
    Deno: { env: { get: () => 'test' } }, deliveryOutcome, needsLateEvidence, isFinalOrder,
  });
  new vm.Script(stripTypeScriptTypes(code)).runInContext(context);
  return { handler, updates };
}

function heldQueue() {
  return { id: 'q-a', tenant_id: 'tenant-a', order_id: 'o-a', status: 'verification_required',
    android_device_id: 'device-a', provider_name: 'somtel', receiver_phone: '620000001',
    dispatched_at: new Date(Date.now() - 100_000).toISOString(),
    processing_started_at: new Date(Date.now() - 110_000).toISOString() };
}
function callback(body) {
  return new Request('https://test/activate-package/status', { method: 'POST',
    body: JSON.stringify({ queueId: 'q-a', deviceId: 'device-a', ...body }) });
}

test('late exact-receiver carrier success reconciles the original queue', async () => {
  const { handler, updates } = handlerFor(heldQueue());
  const response = await handler(callback({ status: 'completed', providerResponse: 'Successful transfer to 620000001' }));
  assert.equal(response.status, 200);
  assert.ok(updates.some(u => u.table === 'delivery_queue' && u.data.status === 'completed'));
  assert.ok(updates.some(u => u.table === 'orders' && u.data.delivery_status === 'delivered'));
});

test('generic late success cannot verify or requeue an ambiguous delivery', async () => {
  const { handler, updates } = handlerFor(heldQueue());
  const response = await handler(callback({ status: 'completed', providerResponse: 'Successful' }));
  assert.equal(response.status, 200);
  assert.equal(updates.length, 0);
});

test('90-second evidence rule applies before the next watchdog tick', async () => {
  const q = heldQueue(); q.status = 'processing';
  const { handler, updates } = handlerFor(q);
  const response = await handler(callback({ status: 'completed', providerResponse: 'Successful' }));
  assert.equal(response.status, 200);
  assert.equal(updates.length, 0);
});

test('late callback from the wrong device is rejected', async () => {
  const q = heldQueue(); q.android_device_id = 'another-device';
  const { handler, updates } = handlerFor(q);
  const response = await handler(callback({ status: 'completed', providerResponse: 'Successful transfer to 620000001' }));
  assert.equal(response.status, 403);
  assert.equal(updates.length, 0);
});

test('final order cannot be reopened by a late device callback', async () => {
  const { handler, updates } = handlerFor(heldQueue(), { status: 'paid', delivery_status: 'delivered' });
  const response = await handler(callback({ status: 'timeout' }));
  assert.equal(response.status, 200);
  assert.equal(updates.length, 0);
});

test('stale carrier success after the correlation window remains held', async () => {
  const q = heldQueue(); q.processing_started_at = new Date(Date.now()-15*60_000).toISOString();
  const { handler, updates } = handlerFor(q);
  const response = await handler(callback({ status: 'completed', providerResponse: 'Successful transfer to 620000001' }));
  assert.equal(response.status, 200);
  assert.equal(updates.length, 0);
});
