import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Somlink virtual device and safe manual send', () => {
  const card = read('src/components/admin/SomlinkApiDeviceCard.tsx');
  const devices = read('src/components/admin/simple/CustomerViews.tsx');
  const dashboard = read('src/components/pages/SimpleAdminDashboard.tsx');
  const sql = read('supabase/migrations/20261116113000_secure_manual_somlink_delivery.sql');

  it('renders Somlink with the exact compact Dashboard device/SIM layout and the same + button', () => {
    expect(dashboard).toContain('Devices & SIM Balances');
    expect(dashboard).toContain('grid grid-cols-2 gap-2');
    expect(dashboard).toContain('<SomlinkApiDeviceCard isSo={isSo} display="dashboard" />');
    expect(card).toContain("display?: 'devices' | 'dashboard'");
    expect(card).toContain("display === 'dashboard'");
    expect(card).toContain('bg-gradient-to-r from-blue-50 to-blue-100');
    expect(card).toContain('bg-purple-600 px-2 py-1 flex items-center justify-between');
    expect(card).toContain('w-5 h-5 rounded-full bg-white/30 text-white flex items-center justify-center');
    expect(card).toContain('<Plus className="w-3 h-3" />');
    expect(card).toContain('onClick={() => setOpen(true)}');
    expect(card).toContain('disabled={!ready || !canManual');
    expect(card).toContain("status.data?.balance == null ? '—'");
    expect(card).toContain("can('view_profit')");
    expect(card).toContain('API · VIRTUAL');
    expect(card).toContain('Last reported');
    expect(card).toContain('Not live');
    expect(card).toContain("if (display === 'dashboard' && status.isLoading) return null");
  });

  it('shows Somlink API in Devices like a SIM but labels the source accurately', () => {
    expect(devices).toContain('<SomlinkApiDeviceCard isSo={isSo} />');
    expect(card).toContain('Somlink API');
    expect(card).toContain('VIRTUAL');
    expect(card).toContain('Haraagii ugu dambeeyey');
    expect(card).toContain('Ma aha live balance');
    expect(card).toContain("status.isSuccess && !status.data.configured");
    expect(card).toContain("'somlink_manual_device_status'");
  });

  it('requires category selection before showing only its Somlink bundles', () => {
    expect(card).toContain("from('package_categories')");
    expect(card).toContain("select('id,category_name')");
    expect(card).toContain("select('id,category_id,package_name,data_amount,cost_price,selling_price')");
    expect(card).toContain(".eq('tenant_id', tenantId!).in('provider_id', ids)");
    expect(card).toContain("linkedCategoryIds.has(category.id)");
    expect(card).toContain("p.category_id === categoryId");
    expect(card).toContain('const chosen = categoryPackages.find((p) => p.id === packageId)');
    expect(card).toContain('disabled={!categoryId || packages.isLoading || packages.isError}');
    expect(card).toContain("setCategoryId(e.target.value); setPackageId(''); requestRef.current = null");
    expect(card).toContain("setRecipient(''); setCategoryId(''); setPackageId(''); requestRef.current = null");
    expect(card.indexOf('id="somlink-category"')).toBeLessThan(card.indexOf('id="somlink-package"'));
    expect(card).toContain('categoryPackages.map((p) => (');
    expect(card).toContain('Select a category first');
    expect(card).toContain('Dooro category');
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
