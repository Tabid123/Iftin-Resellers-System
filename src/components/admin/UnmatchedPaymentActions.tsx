import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RotateCcw, UserPlus, X, Send } from 'lucide-react';
import { toast } from 'sonner';
import { saveOfflineRegistration } from '@/lib/offlineRegistration';
import { resendOrder, digits9 } from '@/lib/resendOrder';

/**
 * Labada tallaabo ee lacag aan match noqon:
 *  - "Dib u dir": shirkad → category → xirmo → xaqiijin → dalab cusub.
 *  - "Diiwaan gali": lambarka diraha waxaa loo diiwaan geliyaa offline reg.
 */
export const UnmatchedPaymentActions: React.FC<{
  payment: any;
  onChanged?: () => void;
}> = ({ payment, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [receiver, setReceiver] = useState(digits9(payment.sender_phone));
  const [providerName, setProviderName] = useState('');
  const [providers, setProviders] = useState<any[]>([]);

  // Resend picker state
  const [providerId, setProviderId] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [packages, setPackages] = useState<any[]>([]);
  const [packageId, setPackageId] = useState('');
  const [target, setTarget] = useState(digits9(payment.sender_phone));
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!showRegister && !showResend) return;
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true)
      .order('display_order')
      .then(({ data }) => setProviders(data || []));
  }, [showRegister, showResend]);

  useEffect(() => {
    if (!providerId) { setCategories([]); setCategoryId(''); return; }
    supabase.from('package_categories').select('id, category_name').eq('provider_id', providerId)
      .eq('is_active', true).order('display_order')
      .then(({ data }) => setCategories(data || []));
  }, [providerId]);

  useEffect(() => {
    if (!providerId) { setPackages([]); setPackageId(''); return; }
    let q = supabase.from('data_packages_config')
      .select('id, package_name, data_amount, selling_price, cost_price')
      .eq('provider_id', providerId).eq('is_active', true).order('display_order');
    if (categoryId) q = q.eq('category_id', categoryId);
    q.then(({ data }) => setPackages(data || []));
  }, [providerId, categoryId]);

  const chosenPkg = packages.find(p => p.id === packageId);
  const chosenProvider = providers.find(p => p.id === providerId);
  const canSend = Boolean(providerId && packageId && target.length === 9);

  const sendResend = async () => {
    if (!chosenPkg) return;
    setBusy(true);
    try {
      const res = await resendOrder({
        provider_id: providerId,
        provider_name: chosenProvider?.provider_name,
        package_id: chosenPkg.id,
        package_name: chosenPkg.package_name,
        data_amount: chosenPkg.data_amount,
        selling_price: chosenPkg.selling_price,
        cost_price: chosenPkg.cost_price ?? 0,
        sender_phone: digits9(payment.sender_phone),
        customer_phone: digits9(payment.sender_phone),
        payment_number: payment.receiver_sim ?? 'UNMATCHED',
        payment_source: 'offline',
        delivery_notes: `Unmatched payment ${payment.id}`,
      }, target);
      if (!res.ok) throw new Error(res.message);
      await supabase.from('payment_receipts')
        .update({ status: 'matched', matched_order_id: res.orderId, admin_notes: 'Manual dispatch from unmatched' })
        .eq('id', payment.id);
      toast.success('Dalabka waa la diray');
      setShowResend(false);
      setConfirming(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Dib u dirista way fashilantay');
    } finally {
      setBusy(false);
    }
  };

  const register = async () => {
    if (!providerName) { toast.error('Fadlan dooro shirkadda'); return; }
    setBusy(true);
    try {
      const chosen = providers.find(p => p.provider_name === providerName);
      const res = await saveOfflineRegistration({
        senderPhone: payment.sender_phone,
        receiverPhone: receiver,
        providerName,
        providerId: chosen?.id ?? null,
      });
      if (!res.ok) throw new Error(res.message ?? 'Khalad');
      toast.success('Waa la diiwaan geliyay');
      setShowRegister(false);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? 'Diiwaangelintu way fashilantay');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={busy}
          onClick={() => { setShowResend(v => !v); setConfirming(false); }}>
          {showResend ? <X className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
          Dib u dir
        </Button>
        <Button size="sm" variant="secondary" className="h-7 text-[11px] gap-1" disabled={busy} onClick={() => setShowRegister(v => !v)}>
          {showRegister ? <X className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
          Diiwaan gali
        </Button>
      </div>

      {showResend && (
        <div className="rounded-md border p-2 space-y-2 bg-muted/40">
          {!confirming ? (
            <>
              <select value={providerId} onChange={e => { setProviderId(e.target.value); setPackageId(''); }}
                className="w-full h-8 rounded-md border bg-background px-2 text-xs">
                <option value="">Dooro shirkadda *</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
              </select>

              <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPackageId(''); }}
                disabled={!providerId}
                className="w-full h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50">
                <option value="">Dhammaan categories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.category_name}</option>)}
              </select>

              <select value={packageId} onChange={e => setPackageId(e.target.value)} disabled={!providerId}
                className="w-full h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50">
                <option value="">Dooro xirmada *</option>
                {packages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.package_name} · ${Number(p.selling_price).toFixed(2)}
                  </option>
                ))}
              </select>

              <Input value={target} inputMode="numeric"
                onChange={e => setTarget(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="Lambarka qaataha" className="h-8 text-xs" />

              <Button size="sm" className="h-7 w-full text-[11px]" disabled={!canSend}
                onClick={() => setConfirming(true)}>
                Sii wad
              </Button>
            </>
          ) : (
            <>
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-[11px]">
                Ma hubtaa inaad u dirto <b>{chosenPkg?.package_name}</b> (${Number(chosenPkg?.selling_price ?? 0).toFixed(2)}) lambarka +252{target}?
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="h-7 flex-1 text-[11px]" disabled={busy}
                  onClick={() => setConfirming(false)}>Dib u noqo</Button>
                <Button size="sm" className="h-7 flex-1 text-[11px] gap-1" disabled={busy} onClick={sendResend}>
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} OK
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {showRegister && (
        <div className="rounded-md border p-2 space-y-2 bg-muted/40">
          <div className="text-[11px] text-muted-foreground">Diraha: {digits9(payment.sender_phone)}</div>
          <Input
            value={receiver}
            inputMode="numeric"
            onChange={(e) => setReceiver(e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="Lambarka qaataha"
            className="h-8 text-xs"
          />
          <select
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className="w-full h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">Dooro shirkadda *</option>
            {providers.map(p => <option key={p.id} value={p.provider_name}>{p.provider_name}</option>)}
          </select>
          <Button size="sm" className="h-7 w-full text-[11px]" disabled={busy} onClick={register}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Keydi'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default UnmatchedPaymentActions;
