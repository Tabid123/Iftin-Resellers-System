import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { fetchIftinCatalog, hasCatalog, mapPaymentProviders } from '@/lib/iftinCatalog';
import { loadResellerOverrides, savePaymentNumber } from '@/lib/resellerOverrides';
import CachedImage from '@/components/CachedImage';

type Row = {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  base_payment_number: string | null;
  payment_number: string | null;
};

/** The only locally stored value per payment provider: payment_number. */
export default function IftinPaymentNumbers() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const catalog = await fetchIftinCatalog({ force: true });
      await loadResellerOverrides();
      if (!hasCatalog(catalog)) {
        setRows([]);
        setLoading(false);
        return;
      }
      const list = mapPaymentProviders(catalog!).map((p: any) => ({
        id: p.id,
        provider_name: p.provider_name,
        provider_logo: p.provider_logo ?? null,
        base_payment_number: p.base_payment_number ?? null,
        payment_number: p.payment_number ?? null,
      }));
      setRows(list);
      setDrafts(Object.fromEntries(list.map((p) => [p.id, p.payment_number ?? ''])));
      setLoading(false);
    })();
  }, []);

  const save = async (row: Row) => {
    const value = (drafts[row.id] ?? '').trim();
    if (!value) {
      toast({ title: 'Lambar ma jiro', description: 'Fadlan geli payment number', variant: 'destructive' });
      return;
    }
    setSaving(row.id);
    try {
      await savePaymentNumber(row.id, value);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, payment_number: value } : r)));
      toast({ title: 'La keydiyay', description: `${row.provider_name}: ${value}` });
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
    <div className="space-y-4 p-4">
      <p className="text-sm text-muted-foreground">
        Bixiyeyaasha lacagta iyo USSD template-yada waxay ka yimaadaan Iftin (read-only). Adigu waxaad
        beddeli kartaa <span className="font-semibold">payment number</span>-ka oo kaliya.
      </p>

      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b">
              <th className="px-4 py-2">Bixiye</th>
              <th className="px-4 py-2">Iftin default</th>
              <th className="px-4 py-2">Payment number</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <CachedImage src={row.provider_logo} alt={row.provider_name} bundledName={row.provider_name} kind="payment" className="h-7 w-7 rounded object-contain" />
                    <span className="font-medium">{row.provider_name}</span>
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-muted-foreground">
                  {row.base_payment_number ?? '—'}
                </td>
                <td className="px-4 py-2">
                  <Input
                    inputMode="numeric"
                    value={drafts[row.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                    placeholder="tusaale 615555495"
                    className="w-40"
                  />
                </td>
                <td className="px-4 py-2">
                  <Button
                    size="sm"
                    disabled={saving === row.id || (drafts[row.id] ?? '').trim() === (row.payment_number ?? '')}
                    onClick={() => save(row)}
                  >
                    {saving === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
