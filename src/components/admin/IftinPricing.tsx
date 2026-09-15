import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2, Lock, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { fetchIftinCatalog, hasCatalog, mapPackages, mapProviders, resolveTenantId } from '@/lib/iftinCatalog';
import { isSellPriceValid, loadResellerOverrides, marginOf, saveSellPrice } from '@/lib/resellerOverrides';
import { setIftinPrices } from '@/lib/iftinPricing.functions';

type Row = {
  id: string;
  package_name: string;
  data_amount: string;
  provider_id: string;
  base_price: number;
  cost_price: number | null;
  sell_price: number;
};

/**
 * Iftin packages are read-only. The reseller edits nothing but `sell_price`,
 * which is stored locally (package_id → sell_price) and must be >= base_price.
 */
export default function IftinPricing() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [providers, setProviders] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const catalog = await fetchIftinCatalog({ force: true });
      await loadResellerOverrides();
      if (!hasCatalog(catalog)) {
        setRows([]);
        setLoading(false);
        return;
      }
      const provMap: Record<string, string> = {};
      for (const p of mapProviders(catalog!)) provMap[p.id] = p.provider_name;
      const pkgs = mapPackages(catalog!).map((p: any) => ({
        id: p.id,
        package_name: p.package_name,
        data_amount: p.data_amount,
        provider_id: p.provider_id,
        base_price: Number(p.base_price ?? p.cost_price ?? 0),
        cost_price: p.cost_price === null || p.cost_price === undefined ? null : Number(p.cost_price),
        sell_price: Number(p.selling_price ?? 0),
      }));
      setProviders(provMap);
      setRows(pkgs);
      setDrafts(Object.fromEntries(pkgs.map((p) => [p.id, String(p.sell_price)])));
      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, Row[]> = {};
    for (const r of rows) (out[r.provider_id] ||= []).push(r);
    return out;
  }, [rows]);

  const pushPrices = async (prices: Array<{ package_id: string; price: number }>) => {
    const tenantId = await resolveTenantId();
    if (!tenantId) throw new Error('Reseller-ka lama garanayo');
    const res = await setIftinPrices({ data: { tenantId, prices } });
    if (!res.ok) throw new Error(res.message);
    return res.data;
  };




  const save = async (row: Row) => {
    const value = Number(drafts[row.id]);
    if (!isSellPriceValid(value, row.base_price)) {
      toast({
        title: 'Qiimaha ma saxna',
        description: `Sell price waa inuu ka weyn yahay ama la mid yahay base price ($${row.base_price})`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(row.id);
    try {
      // Iftin's partner_pricing list is the source of truth for matching payments.
      await pushPrices([{ package_id: row.id, price: value }]);
      await saveSellPrice(row.id, value, row.base_price);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, sell_price: value } : r)));
      toast({ title: 'La keydiyay', description: `${row.package_name}: $${value}` });
    } catch (e: any) {
      toast({ title: 'Khalad', description: e?.message ?? 'Lama keydin', variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Iftin catalog lama helin — hubi in API key-ga Iftin la dejiyay.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-4">
      <p className="text-sm text-muted-foreground">
        Packages-ka wuxuu ka yimaadaa Iftin (read-only). Adigu waxaad beddeli kartaa
        <span className="font-semibold"> sell price </span>oo kaliya. Iftin wuxuu kaa qaadanayaa base price;
        faa'iidadaadu waa sell price − base price. Qiimo kastoo la keydiyo si toos ah ayaa loogu dirayaa
        liiska Iftin (partner pricing).
      </p>


      {Object.entries(grouped).map(([providerId, list]) => (
        <div key={providerId} className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/40 font-semibold">
            {providers[providerId] ?? providerId}
          </div>
          {/* Mobile: accordion list */}
          <div className="sm:hidden divide-y">
            {list.map((row) => {
              const draft = Number(drafts[row.id]);
              const margin = marginOf(draft, row.base_price);
              const invalid = !isSellPriceValid(draft, row.base_price);
              const open = expandedId === row.id;
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : row.id)}
                    className="w-full flex items-center gap-2 px-3 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{row.package_name}</div>
                      <div className="truncate text-xs text-muted-foreground">{row.data_amount}</div>
                    </div>
                    <span className="shrink-0 font-mono text-sm">${row.sell_price}</span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {open && (
                    <div className="space-y-3 bg-muted/30 px-3 pb-3 pt-1">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Base:</span>
                          <span className="font-mono">${row.base_price}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Lock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground">Cost:</span>
                          <span className="font-mono">
                            {row.cost_price === null ? '—' : `$${row.cost_price}`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <label className="mb-1 block text-xs text-muted-foreground">Sell price</label>
                          <Input
                            type="number"
                            step="0.01"
                            min={row.base_price}
                            value={drafts[row.id] ?? ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                            className={`w-full ${invalid ? 'border-destructive' : ''}`}
                          />
                        </div>
                        <Button
                          className="shrink-0"
                          disabled={invalid || saving === row.id || draft === row.sell_price}
                          onClick={() => save(row)}
                        >
                          {saving === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className={`text-xs font-mono ${margin < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        Margin: ${margin.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2">Package</th>
                  <th className="px-4 py-2">Base price</th>
                  <th className="px-4 py-2">Cost price</th>
                  <th className="px-4 py-2">Sell price</th>
                  <th className="px-4 py-2">Margin</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const draft = Number(drafts[row.id]);
                  const margin = marginOf(draft, row.base_price);
                  const invalid = !isSellPriceValid(draft, row.base_price);
                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">{row.package_name}</div>
                        <div className="text-xs text-muted-foreground">{row.data_amount}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Lock className="h-3 w-3 text-muted-foreground" />${row.base_price}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          {row.cost_price === null ? '—' : `$${row.cost_price}`}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={row.base_price}
                          value={drafts[row.id] ?? ''}
                          onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                          className={`w-28 ${invalid ? 'border-destructive' : ''}`}
                        />
                      </td>
                      <td className={`px-4 py-2 font-mono ${margin < 0 ? 'text-destructive' : ''}`}>
                        ${margin.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          disabled={invalid || saving === row.id || draft === row.sell_price}
                          onClick={() => save(row)}
                        >
                          {saving === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
