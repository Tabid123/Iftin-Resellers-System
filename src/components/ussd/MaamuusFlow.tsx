import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Loader2, Smartphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchIftinCatalog, hasCatalog, mapPaymentProviders } from '@/lib/iftinCatalog';
import CachedImage from '@/components/CachedImage';
import { getAllowedPrefixes, matchesAllowedPrefix, formatPrefixes } from '@/lib/phonePrefixes';
import { useTenant } from '@/contexts/TenantContext';
import { activeWorkspaceId, workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';

export type MaamuusSelection = {
  root: any;
  choice: { index: string; label: string; carrier_label?: string; selling_price: number; info_line1?: string | null; info_line2?: string | null };
  discoveryId: string;
  senderPhone: string;
  receiverPhone: string;
  paymentProviderId: string;
};

type Props = {
  roots: any[];
  providerName: string;
  brandName: string;
  onBack: () => void;
  onSelect: (selection: MaamuusSelection) => void;
  /** Marka la bixiyo, xirmada la doortay waxaa toos loogu gudbinayaa bogga lacag bixinta. */
  onRootSelect?: (root: any) => void;
};

type DiscoveryItem = {
  index: string;
  label: string;
  carrier_label?: string;
  selling_price: number | null;
  info_line1?: string | null;
  info_line2?: string | null;
  price_missing?: boolean;
};

const normalizePhone = (raw: string) => {
  let digits = (raw || '').replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(-9);
};

export default function MaamuusFlow({ roots, providerName, brandName, onBack, onSelect, onRootSelect }: Props) {
  const maamuusTenant = useTenant();
  const maamuusWorkspaceId =
    maamuusTenant.status === 'ready' || maamuusTenant.status === 'suspended'
      ? maamuusTenant.tenant.id || null
      : null;
  const [step, setStep] = useState<'roots' | 'details' | 'search'>('roots');
  const [root, setRoot] = useState<any | null>(null);
  const [paymentProviderId, setPaymentProviderId] = useState('');
  const [sender, setSender] = useState('');
  const [receiver, setReceiver] = useState('');
  const [formError, setFormError] = useState('');

  const [discoveryId, setDiscoveryId] = useState('');
  const [state, setState] = useState<'queue' | 'searching' | 'results' | 'failed'>('queue');
  const [ahead, setAhead] = useState(0);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [confirming, setConfirming] = useState<DiscoveryItem | null>(null);
  const pollRef = useRef<number | null>(null);

  const { data: paymentProviders = [] } = useQuery({
    queryKey: workspaceQueryKey(maamuusWorkspaceId, 'paymentProviders'),
    enabled: Boolean(maamuusWorkspaceId),
    queryFn: async () => {
      const catalog = await fetchIftinCatalog();
      if (activeWorkspaceId() !== maamuusWorkspaceId) return [];
      if (hasCatalog(catalog)) {
        const fromIftin = mapPaymentProviders(catalog!);
        if (fromIftin.length) return fromIftin;
      }
      const { data } = await (supabase as any).rpc('get_active_payment_providers');
      if (activeWorkspaceId() !== maamuusWorkspaceId) return [];
      return data || [];
    },
    staleTime: 60 * 1000,
    initialData: () => {
      const cached = workspaceStorage.getJson<any[]>(
        'offline_payment_providers',
        [],
        maamuusWorkspaceId,
      );
      return cached.length ? cached : undefined;
    },
  });

  const stopPolling = () => {
    if (pollRef.current != null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => () => stopPolling(), []);

  // Elapsed timer while searching / queued.
  useEffect(() => {
    if (step !== 'search' || state === 'results' || state === 'failed') return;
    const id = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [step, state]);

  // Live countdown for the held carrier session.
  useEffect(() => {
    if (state !== 'results' || secondsLeft <= 0) return;
    const id = window.setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [state, secondsLeft]);

  const poll = async (id: string) => {
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('get_package_discovery', { p_id: id });
      if (rpcError) throw rpcError;
      const result = data || {};
      if (result.status === 'done') {
        setItems(Array.isArray(result.packages) ? result.packages : []);
        setSecondsLeft(Number(result.session_seconds_left ?? 0));
        setState('results');
        return;
      }
      if (result.status === 'failed') {
        setState('failed');
        setError(result.error || 'Raadinta xirmooyinka way fashilantay.');
        return;
      }
      const { data: queue } = await (supabase as any).rpc('get_discovery_queue_status', { p_id: id });
      if (queue?.found && queue?.status === 'pending') {
        setAhead(Number(queue.ahead ?? 0));
        setState('queue');
      } else {
        setState('searching');
      }
      pollRef.current = window.setTimeout(() => void poll(id), 1500);
    } catch (e: any) {
      setState('failed');
      setError(e?.message || 'Raadinta xirmooyinka way fashilantay.');
    }
  };

  const startDiscovery = async () => {
    const cleanSender = normalizePhone(sender);
    const cleanReceiver = normalizePhone(receiver);
    if (!paymentProviderId) { setFormError('Fadlan dooro habka lacag bixinta.'); return; }
    const payName = paymentProviders.find((p: any) => p.id === paymentProviderId)?.provider_name || '';
    const allowedPay = getAllowedPrefixes(payName);
    if (cleanSender.length !== 9) { setFormError('Fadlan gali lambarka lacagta oo dhan (9 lambar).'); return; }
    if (allowedPay.length && !matchesAllowedPrefix(cleanSender, allowedPay)) {
      setFormError(`Fadlan gali lambarka ${payName} (${formatPrefixes(allowedPay)}).`);
      return;
    }
    if (cleanReceiver.length !== 9) { setFormError('Fadlan gali lambarka xirmada helaya oo dhan (9 lambar).'); return; }
    const allowedReceiver = getAllowedPrefixes(providerName);
    if (allowedReceiver.length && !matchesAllowedPrefix(cleanReceiver, allowedReceiver)) {
      setFormError(`Fadlan gali lambarka shirkada ${providerName} (${formatPrefixes(allowedReceiver)}).`);
      return;
    }
    setFormError('');
    setStep('search');
    setState('queue');
    setElapsed(0);
    setItems([]);
    setError('');
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('request_package_discovery', {
        p_root_package_id: root.id,
        p_phone: cleanReceiver,
      });
      if (rpcError) throw rpcError;
      if (!data?.success || !data?.id) throw new Error(data?.message || 'Codsiga lama abuuri karin.');
      setDiscoveryId(String(data.id));
      void poll(String(data.id));
    } catch (e: any) {
      setState('failed');
      setError(e?.message || 'Codsiga lama abuuri karin.');
    }
  };

  const cancelSearch = () => {
    stopPolling();
    if (discoveryId) void (supabase as any).rpc('release_discovery_session', { p_id: discoveryId });
    setDiscoveryId('');
    setStep('details');
  };

  const expired = state === 'results' && secondsLeft <= 0;
  const selectedPayment = useMemo(
    () => paymentProviders.find((p: any) => p.id === paymentProviderId),
    [paymentProviders, paymentProviderId],
  );

  const header = (title: string, onBackClick: () => void) => (
    <div className="bg-primary text-white px-4 pb-4" style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))' }}>
      <div className="relative flex items-center min-h-[56px]">
        <button onClick={onBackClick} className="p-2 -ml-2 shrink-0" aria-label="Dib u noqo"><ArrowLeft className="w-5 h-5" /></button>
        <div className="pointer-events-none absolute inset-x-10 min-w-0 text-center">
          <h1 className="text-base font-bold truncate">{title}</h1>
          <p className="text-white/80 text-sm truncate">{providerName}</p>
        </div>
      </div>
    </div>
  );

  if (step === 'roots') {
    return (
      <div className="min-h-screen bg-background">
        {header('XIRMO ADIGA KUU GAAR AH', onBack)}
        <div className="px-5 py-3 bg-primary/10">
          <p className="text-[13px] leading-snug text-foreground/80">
            {brandName} ka iibso Internet adigoona qof wicin, waqti kasta!
          </p>
        </div>
        <div className="px-5 pt-5 space-y-4">
          {roots.map((r: any) => (
            <button
              key={r.id}
              onClick={() => { if (onRootSelect) { onRootSelect(r); return; } setRoot(r); setStep('details'); }}
              className="w-full bg-card rounded-2xl border border-border/70 shadow-sm px-4 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
            >
              <Smartphone className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
              <span className="flex-1 text-left text-[15px] font-semibold text-foreground truncate">{r.package_name}</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground/70 shrink-0" strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'details') {
    return (
      <div className="min-h-screen bg-background pb-28">
        {header(root?.package_name || 'Xirmo', () => setStep('roots'))}
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Dooro habka lacag bixinta</p>
            {paymentProviders.map((p: any) => (
              <button
                key={p.id}
                onClick={() => setPaymentProviderId(p.id)}
                className={`w-full bg-card rounded-2xl p-3 flex items-center justify-between border-2 ${paymentProviderId === p.id ? 'border-primary' : 'border-transparent'} shadow-sm`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-14 h-10 flex items-center justify-center bg-muted rounded-lg shrink-0">
                    <CachedImage src={p.provider_logo} alt={p.provider_name} bundledName={p.provider_name} kind="payment" className="w-full h-full object-contain" />
                  </div>
                  <span className="font-semibold text-foreground truncate">{p.provider_name}</span>
                </div>
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${paymentProviderId === p.id ? 'bg-primary border-primary' : 'border-muted-foreground'}`}>
                  {paymentProviderId === p.id && <Check className="w-4 h-4 text-primary-foreground" />}
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Lambarka lacagta laga dirayo</label>
            <div className="flex items-center rounded-xl border border-border bg-card px-3">
              <span className="text-sm font-semibold text-muted-foreground">+252</span>
              <input value={sender} onChange={e => setSender(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" pattern="[0-9]*" placeholder="61XXXXXXX"
                className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold outline-none text-foreground" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Lambarka xirmada helaaya</label>
            <div className="flex items-center rounded-xl border border-border bg-card px-3">
              <span className="text-sm font-semibold text-muted-foreground">+252</span>
              <input value={receiver} onChange={e => setReceiver(e.target.value.replace(/\D/g, '').slice(0, 9))} inputMode="numeric" pattern="[0-9]*" placeholder="61XXXXXXX"
                className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold outline-none text-foreground" />
            </div>
          </div>

          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
          <p className="text-xs text-muted-foreground">Lacag weli lama bixin — marka hore waxaa la baarayaa xirmooyinka.</p>
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur border-t border-border">
          <Button onClick={startDiscovery} className="w-full py-6 text-base font-bold">Sii wad</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      {header(root?.package_name || 'Xirmo', cancelSearch)}

      {(state === 'queue' || state === 'searching') && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          {state === 'queue' ? (
            <>
              <h2 className="text-lg font-bold text-foreground">Waxaad ku jirtaa safka</h2>
              {ahead > 0 && <p className="text-sm text-muted-foreground">Waxaad tahay #{ahead + 1} safka — {ahead} qof ayaa kaa horreeya.</p>}
              <p className="text-sm text-muted-foreground">Lacag weli lama bixin — waad joojin kartaa markasta.</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-foreground">Waa la baarayaa…</h2>
              <p className="text-sm text-muted-foreground">Waxaan ka helaynaa shirkadda xirmooyinka lambarka {normalizePhone(receiver)}.</p>
            </>
          )}
          <p className="text-xs text-muted-foreground">{elapsed}s</p>
          <Button variant="outline" onClick={cancelSearch} className="mt-2 px-8">Jooji</Button>
        </div>
      )}

      {state === 'failed' && (
        <div className="px-6 py-16 text-center space-y-3">
          <h2 className="text-lg font-bold text-destructive">Raadinta ma guulaysan</h2>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button onClick={() => setStep('details')} className="px-8">Dib u baar</Button>
        </div>
      )}

      {state === 'results' && (
        <div className="p-4 space-y-3">
          {expired ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center space-y-2">
              <p className="text-sm font-semibold text-destructive">Waqtigii xiriirku wuu dhamaaday. Fadlan dib u baar xirmooyinka.</p>
              <Button onClick={() => setStep('details')} size="sm">Dib u baar</Button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                Xiriirka shirkadda waa furan yahay — bixi lacagta gudaha {secondsLeft}s
              </p>
            </div>
          )}

          {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Xirmooyin lama helin.</p>}

          {items.map(item => {
            const selectable = !expired && !item.price_missing && item.selling_price != null;
            return (
              <div key={`${item.index}-${item.carrier_label || item.label}`} className="bg-card rounded-xl border border-border shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{item.label}</p>
                    {item.info_line1 && <p className="text-xs text-muted-foreground mt-1">{item.info_line1}</p>}
                    {item.info_line2 && <p className="text-xs text-muted-foreground">{item.info_line2}</p>}
                  </div>
                  <span className="shrink-0 text-lg font-bold text-primary">
                    {item.selling_price != null ? `$${Number(item.selling_price).toFixed(2)}` : '—'}
                  </span>
                </div>
                <Button
                  disabled={!selectable}
                  onClick={() => setConfirming(item)}
                  className="w-full mt-3 font-bold disabled:opacity-50"
                >
                  IIBSO
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 space-y-3">
            <h2 className="text-lg font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
            <div className="rounded-xl border border-border p-3 space-y-1">
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-foreground">{confirming.label}</span>
                <span className="font-bold text-primary">${Number(confirming.selling_price).toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Lacagta laga dirayo: +252-{normalizePhone(sender)}</p>
              <p className="text-xs text-muted-foreground">Xirmada helaaya: +252-{normalizePhone(receiver)}</p>
              <p className="text-xs text-muted-foreground">Lacag bixinta: {selectedPayment?.provider_name || '—'}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 py-5 font-bold" onClick={() => setConfirming(null)}>MAYA</Button>
              <Button
                className="flex-1 py-5 font-bold"
                onClick={() => {
                  stopPolling();
                  onSelect({
                    root,
                    choice: {
                      index: confirming.index,
                      label: confirming.label,
                      carrier_label: confirming.carrier_label,
                      selling_price: Number(confirming.selling_price),
                      info_line1: confirming.info_line1,
                      info_line2: confirming.info_line2,
                    },
                    discoveryId,
                    senderPhone: normalizePhone(sender),
                    receiverPhone: normalizePhone(receiver),
                    paymentProviderId,
                  });
                }}
              >
                HAA IIBSO
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
