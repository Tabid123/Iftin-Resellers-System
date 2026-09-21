import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';

// Execute the actual Edge handler with its remote imports injected. No live
// device or delivery data is touched by these regression tests.
function heartbeatHandler(updateError: unknown = null) {
  let handler: (request: Request) => Promise<Response>;
  const writes: Record<string, unknown>[] = [];
  const from = vi.fn((table: string) => {
    if (table !== 'android_devices') throw new Error(`Unexpected recovery access: ${table}`);
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      update: (values: Record<string, unknown>) => { writes.push(values); return chain; },
      maybeSingle: async () => ({ data: { id: 'row-a', device_id: 'device-a', tenant_id: 'tenant-a' } }),
      then: (resolve: (result: unknown) => void) => resolve({ error: updateError, count: 1 }),
    };
    return chain;
  });
  const source = readFileSync(new URL('../supabase/functions/activate-package/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, {
    serve: (callback: typeof handler) => { handler = callback; },
    createClient: () => ({ from }),
    Deno: { env: { get: () => 'test' } },
    Request, Response, URL, console: { log() {}, warn() {}, error() {} },
  });
  return { request: (batteryLevel = 72) => handler!(new Request('https://example.test/activate-package/ping', {
    method: 'POST',
    body: JSON.stringify({ deviceId: 'device-a', presenceOnly: true, batteryLevel, isCharging: true }),
  })), writes, from };
}

describe('independent device presence', () => {
  it('saves presence without sweeping or requeueing active deliveries', async () => {
    const test = heartbeatHandler();
    const response = await test.request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(test.writes).toHaveLength(1);
    expect(test.writes[0]).toMatchObject({ battery_level: 72, is_charging: true });
    expect(test.from.mock.calls.every(([table]) => table === 'android_devices')).toBe(true);
  });

  it('does not acknowledge a heartbeat that failed to persist', async () => {
    const test = heartbeatHandler({ message: 'database unavailable' });
    expect((await test.request()).status).toBe(500);
  });

  it('preserves the last battery reading when Android reports unknown', async () => {
    const test = heartbeatHandler();
    expect((await test.request(-1)).status).toBe(200);
    expect(test.writes[0]).not.toHaveProperty('battery_level');
  });
});
