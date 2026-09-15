import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Wallet, CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  fetchIftinWallet,
  requestIftinPayout,
  saveIftinPayoutSettings,
  type IftinWalletData,
} from '@/lib/iftinWallet';

const money = (n: number | null | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const IftinWallet: React.FC = () => {
  const [data, setData] = useState<IftinWalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [amount, setAmount] = useState('');
  const [open, setOpen] = useState(false);

  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('evc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await fetchIftinWallet();
      setData(w);
      setPhone(w.payout_settings?.payout_phone ?? '');
      setMethod(w.payout_settings?.payout_method ?? 'evc');
    } catch (e: any) {
      setError(e?.message ?? 'Wallet-ka lama soo dejin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPaidOut = useMemo(
    () => (data?.payouts ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [data],
  );

  const onWithdraw = async () => {
    const p = phone.trim();
    if (p.length !== 9) {
      toast({ title: 'Lambar sax ah geli', description: 'Tusaale: 61xxxxxxx', variant: 'destructive' });
      return;
    }
    setWithdrawing(true);
    try {
      await saveIftinPayoutSettings({
        payout_phone: p,
        payout_method: method,
        auto_payout_enabled: true,
        min_payout_amount: 1,
      });
      const res = await requestIftinPayout(Number(amount) || undefined);
      toast({
        title: 'Codsi baxsi waa la diray',
        description: res?.message ?? 'Iftin ayaa lacagta kuu soo dirta',
      });
      setAmount('');
      setOpen(false);
      void load();
    } catch (e: any) {
      toast({ title: 'Baxsi wuu fashilmay', description: e?.message ?? '—', variant: 'destructive' });
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Wallet-ka waa la soo dejinayaa…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Cusboonaysii
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Wallet className="w-4 h-4 shrink-0" /> La baxsan karo
          </div>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{money(data?.wallet.available)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" /> La baxay
          </div>
          <p className="mt-1 text-2xl font-semibold">{money(data?.wallet.paid_out)}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Baxsi (Withdraw)</h3>
        <Button
          className="w-full"
          onClick={() => setOpen(true)}
          disabled={!(data?.wallet.available ?? 0)}
        >
          <Send className="w-4 h-4 mr-2" /> Withdraw
        </Button>
        <p className="text-xs text-muted-foreground">
          Otomaatig: 24 saac kadib gaarsiinta, Iftin ayaa EVC/Jeeb kuugu soo dirta lambarka baxsiga.
        </p>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Baxsi lacag</DialogTitle>
            <DialogDescription>
              Geli lambarka lacagta lagu soo dirayo. La baxsan karo: {money(data?.wallet.available)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="payout-phone">Lambarka baxsiga</Label>
              <Input
                id="payout-phone"
                inputMode="numeric"
                placeholder="61xxxxxxx"
                value={phone}
                maxLength={9}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="payout-method">Habka</Label>
              <select
                id="payout-method"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="evc">EVC Plus</option>
                <option value="jeeb">Jeeb</option>
                <option value="edahab">eDahab</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="payout-amount">Qadarka (madhan = dhammaan)</Label>
              <Input
                id="payout-amount"
                inputMode="decimal"
                placeholder={money(data?.wallet.available)}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={onWithdraw} disabled={withdrawing}>
              {withdrawing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Dir codsiga
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Lacagaha lala baxay</h3>
          <span className="text-sm text-muted-foreground">Wadar: {money(totalPaidOut)}</span>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Waqtiga</th>
                <th className="py-2 pr-3">Lambarka</th>
                <th className="py-2 pr-3">Habka</th>
                <th className="py-2 pr-3">Qadarka</th>
                <th className="py-2 pr-3">Xaalad</th>
              </tr>
            </thead>
            <tbody>
              {(data?.payouts ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    Weli baxsi ma jiro
                  </td>
                </tr>
              )}
              {(data?.payouts ?? []).map((p, i) => (
                <tr key={p.id ?? i} className="border-t">
                  <td className="py-2 pr-3 whitespace-nowrap">{when(p.created_at)}</td>
                  <td className="py-2 pr-3">{p.payout_phone ?? '—'}</td>
                  <td className="py-2 pr-3 uppercase">{p.payout_method ?? '—'}</td>
                  <td className="py-2 pr-3 font-medium text-emerald-600">{money(p.amount)}</td>
                  <td className="py-2 pr-3">{p.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-3">
          {(data?.payouts ?? []).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Weli baxsi ma jiro</p>
          )}
          {(data?.payouts ?? []).map((p, i) => (
            <div key={p.id ?? i} className="rounded-lg border p-3 text-sm">
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <span className="truncate text-muted-foreground">{when(p.created_at)}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs">{p.status ?? '—'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Lambarka</p>
                  <p className="font-medium">{p.payout_phone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Habka</p>
                  <p className="font-medium uppercase">{p.payout_method ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Qadarka</p>
                  <p className="font-medium text-emerald-600">{money(p.amount)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

    </div>
  );
};

export default IftinWallet;
