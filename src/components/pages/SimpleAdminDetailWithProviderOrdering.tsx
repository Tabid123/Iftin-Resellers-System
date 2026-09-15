import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import { useParams } from '@/lib/router-compat';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import CachedImage from '@/components/CachedImage';
import SimpleAdminDetail from '@/components/pages/SimpleAdminDetail';
import { toast } from 'sonner';

type ProviderRow = {
  id: string;
  tenant_id: string;
  provider_name: string;
  provider_logo: string | null;
  display_order: number | null;
};

const normalizeOrder = (rows: ProviderRow[]) =>
  [...rows]
    .sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0))
    .map((row, index) => ({ ...row, display_order: index + 1 }));

export default function SimpleAdminDetailWithProviderOrdering() {
  const { type } = useParams<{ type: string }>();
  const tenantState = useTenant();
  const tenantId = tenantState.status === 'ready' ? tenantState.tenant?.id ?? null : null;
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isProvidersPage = type === 'providers';

  const loadProviders = useCallback(async () => {
    if (!tenantId || !isProvidersPage) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('providers_config')
      .select('id,tenant_id,provider_name,provider_logo,display_order')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    setProviders(normalizeOrder((data ?? []) as ProviderRow[]));
    setLoading(false);
  }, [isProvidersPage, tenantId]);

  useEffect(() => {
    if (open) void loadProviders();
  }, [open, loadProviders]);

  const orderedProviders = useMemo(() => normalizeOrder(providers), [providers]);

  const moveProvider = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= orderedProviders.length || saving) return;
    const next = [...orderedProviders];
    [next[index], next[target]] = [next[target], next[index]];
    setProviders(next.map((row, i) => ({ ...row, display_order: i + 1 })));
  };

  const saveOrder = async () => {
    if (!tenantId || saving) return;
    setSaving(true);

    try {
      // Two-phase write avoids temporary duplicate order values in projects that
      // enforce uniqueness. Both phases are explicitly scoped to this tenant.
      for (let i = 0; i < orderedProviders.length; i += 1) {
        const row = orderedProviders[i];
        const { error } = await supabase
          .from('providers_config')
          .update({ display_order: 10000 + i })
          .eq('id', row.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      }

      for (let i = 0; i < orderedProviders.length; i += 1) {
        const row = orderedProviders[i];
        const { error } = await supabase
          .from('providers_config')
          .update({ display_order: i + 1 })
          .eq('id', row.id)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      }

      setProviders(orderedProviders.map((row, i) => ({ ...row, display_order: i + 1 })));
      toast.success('Kala hormarinta shirkadaha waa la kaydiyay');
      setOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Kala hormarinta lama kaydin');
      await loadProviders();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SimpleAdminDetail />

      {isProvidersPage && tenantId && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="fixed bottom-24 right-4 z-[70] flex items-center gap-2 rounded-full bg-purple-600 px-4 py-3 text-sm font-bold text-white shadow-lg transition active:scale-95 dark:bg-purple-500"
          >
            <GripVertical className="h-4 w-4" />
            Kala hormari
          </button>

          {open && (
            <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
              <div className="max-h-[82vh] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-gray-900 sm:rounded-2xl">
                <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-800">
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">Kala hormari shirkadaha</h2>
                    <p className="text-xs text-gray-500">Sidaan aad u dhigto ayay app-ka tenant-kan uga soo muuqanayaan.</p>
                  </div>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
                  {loading ? (
                    <div className="py-10 text-center text-sm text-gray-500">Waa la soo dejinayaa...</div>
                  ) : orderedProviders.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-500">Shirkado lama helin</div>
                  ) : (
                    orderedProviders.map((provider, index) => (
                      <div key={provider.id} className="flex items-center gap-3 rounded-xl border bg-white p-2.5 dark:border-gray-800 dark:bg-gray-900">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          {index + 1}
                        </span>
                        <CachedImage
                          src={provider.provider_logo}
                          alt={provider.provider_name}
                          bundledName={provider.provider_name}
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {provider.provider_name}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-label="Kor u qaad"
                            disabled={index === 0 || saving}
                            onClick={() => moveProvider(index, -1)}
                            className="rounded-lg border p-2 text-gray-700 disabled:opacity-25 dark:border-gray-700 dark:text-gray-200"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Hoos u dhig"
                            disabled={index === orderedProviders.length - 1 || saving}
                            onClick={() => moveProvider(index, 1)}
                            className="rounded-lg border p-2 text-gray-700 disabled:opacity-25 dark:border-gray-700 dark:text-gray-200"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2 border-t p-4 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={saving}
                    className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
                  >
                    Ka noqo
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveOrder()}
                    disabled={saving || loading || orderedProviders.length === 0}
                    className="flex-1 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving ? 'Waa la kaydinayaa...' : 'Kaydi kala hormarinta'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
