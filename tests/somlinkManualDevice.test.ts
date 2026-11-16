import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Somlink virtual device and safe manual send', () => {
  const card = read('src/components/admin/SomlinkApiDeviceCard.tsx');
  const devices = read('src/components/admin/simple/CustomerViews.tsx');
  const sql = read('supabase/migrations/20261116113000_secure_manual_somlink_delivery.sql');

  it('shows Somlink API in Devices like a SIM but labels the source accurately', () => {
    expect(devices).toContain('<SomlinkApiDeviceCard isSo={isSo} />');
    expect(card).toContain('Somlink API');
    expect(card).toContain('VIRTUAL');
    expect(card).toContain('Haraagii ugu dambeeyey');
    expect(card).toContain('Ma aha live balance');
    expect(card).toContain("status.isSuccess && !status.data.configured");
    expect(card).toContain("'somlink_manual_device_status'");
  });

  it('allows manual delivery only for an authorized admin of an active API tenant', () => {
    expect(card).toContain("can('manual_transactions')");
    expect(card).toContain("!ready || !canManual");
    expect(sql).toContain("v_membership_role NOT IN ('owner', 'admin')");
    expect(sql).toContain("permission_key = 'manual_transactions'");
    expect(sql).toContain('public.somlink_tenant_ready()');
    expect(sql).toContain('public.is_demo_tenant(p_tenant_id)');
    expect(sql).toContain("p_tenant_id IS DISTINCT FROM public.effective_tenant_id()");
    expect(sql).toContain("p_tenant_id IS DISTINCT FROM public.current_request_tenant_id()");
  });

  it('only accepts 64 Somlink recipients, active mapped bundles, and positive configured cost', () => {
    expect(card).toContain('^64\\d{7}$');
    expect(sql).toContain("v_normalized_phone !~ '^64[0-9]{7}$'");
    expect(sql).toContain("lower(btrim(pr.provider_name)) = 'somlink'");
    expect(sql).toContain('p.somlink_bundle_id IS NOT NULL');
    expect(sql).toContain('p.is_active IS TRUE');
    expect(sql).toContain('p.cost_price > 0');
    expect(sql).toContain('p.selling_price > 0.01');
  });

  it('is transactionally idempotent and dispatches exclusively via existing server-side queue', () => {
    expect(sql).toContain('orders_somlink_manual_request_once');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("v_ref := 'somlink-manual:' || p_request_id::text");
    expect(sql).toContain('INSERT INTO public.orders');
    expect(sql).toContain('INSERT INTO public.delivery_queue');
    // API bundles need no USSD code; guard the manual order against the
    // generic order trigger's config_missing classification.
    expect(sql).toContain("delivery_status = 'config_missing'");
    expect(sql).toContain("SET delivery_status = 'processing'");
    expect(sql).toContain("AND payment_source = 'manual'");

    expect(sql).toContain("'API:SOMLINK:' || v_package.somlink_bundle_id");
    expect(sql).not.toContain('net.http_post(');
    expect(card).toContain('requestRef.current');
    expect(card).toContain("create_manual_somlink_delivery");
  });

  it('never passes API secrets to the browser and never claims queued is delivered', () => {
    expect(card).not.toMatch(/password|dispatch_secret|somlinkLogin|somlinkSendData/);
    expect(card).toContain('Guusha ka hubi Dalabyada');
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.create_manual_somlink_delivery");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.somlink_manual_device_status");
    expect(sql).toContain("jsonb_build_object");
    expect(sql).not.toContain("RETURN jsonb_build_object('wallet_phone'");
    expect(sql).toContain("permission_key='view_profit'");
  });
});
