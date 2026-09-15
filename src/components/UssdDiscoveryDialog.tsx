import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export type DiscoveryChoice = {
  index: string;
  label: string;
  carrier_label?: string;
  selling_price: number | null;
  info_line1?: string | null;
  info_line2?: string | null;
  price_missing?: boolean;
};

type Props = {
  open: boolean;
  rootPackage: any | null;
  providerName: string;
  onClose: () => void;
  onSelect: (choice: DiscoveryChoice, receiverPhone: string, discoveryId: string) => void;
};

const normalizePhone = (raw: string) => {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(-9);
};

export default function UssdDiscoveryDialog({ open, rootPackage, providerName, onClose, onSelect }: Props) {
  const [phone, setPhone] = useState('');
  const [discoveryId, setDiscoveryId] = useState('');
  const [status, setStatus] = useState<'idle' | 'requesting' | 'waiting' | 'done' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const [packages, setPackages] = useState<DiscoveryChoice[]>([]);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current != null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (!open) {
      stopPolling();
      setPhone('');
      setDiscoveryId('');
      setStatus('idle');
      setMessage('');
      setPackages([]);
    }
  }, [open]);

  const poll = async (id: string) => {
    try {
      const { data, error } = await (supabase as any).rpc('get_package_discovery', { p_id: id });
      if (error) throw error;
      const result = data || {};
      if (result.status === 'done') {
        const rows = Array.isArray(result.packages) ? result.packages : [];
        setPackages(rows);
        setStatus('done');
        setMessage(rows.length ? 'Dooro xirmada aad rabto.' : 'Xirmooyin lama helin.');
        return;
      }
      if (result.status === 'failed') {
        setStatus('failed');
        setMessage(result.error || 'Raadinta xirmooyinka way fashilantay.');
        return;
      }

      setStatus('waiting');
      const { data: queue } = await (supabase as any).rpc('get_discovery_queue_status', { p_id: id });
      if (queue?.found && queue?.status === 'pending') {
        setMessage(queue.ahead > 0 ? `Sug… ${queue.ahead} codsi ayaa kaa horreeya.` : 'Sug… qalabka delivery-ga ayaa raadinta bilaabaya.');
      } else {
        setMessage('Sug… xirmooyinka ayaa laga soo akhrinayaa shabakadda.');
      }
      pollRef.current = window.setTimeout(() => void poll(id), 1200);
    } catch (error: any) {
      setStatus('failed');
      setMessage(error?.message || 'Raadinta xirmooyinka way fashilantay.');
    }
  };

  const requestDiscovery = async () => {
    const receiver = normalizePhone(phone);
    if (receiver.length !== 9) {
      setMessage('Fadlan geli lambarka oo dhan (9 lambar).');
      setStatus('failed');
      return;
    }
    if (!rootPackage?.id) return;

    stopPolling();
    setPackages([]);
    setStatus('requesting');
    setMessage('Codsiga ayaa la dirayaa…');
    try {
      const { data, error } = await (supabase as any).rpc('request_package_discovery', {
        p_root_package_id: rootPackage.id,
        p_phone: receiver,
      });
      if (error) throw error;
      if (!data?.success || !data?.id) throw new Error(data?.message || 'Discovery request lama abuuri karin');
      setDiscoveryId(String(data.id));
      setStatus('waiting');
      void poll(String(data.id));
    } catch (error: any) {
      setStatus('failed');
      setMessage(error?.message || 'Discovery request lama abuuri karin.');
    }
  };

  const close = async () => {
    stopPolling();
    if (discoveryId && status === 'done') {
      // Release a held carrier dialog when the customer explicitly abandons it.
      void (supabase as any).rpc('release_discovery_session', { p_id: discoveryId });
    }
    onClose();
  };

  if (!open || !rootPackage) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div>
            <h2 className="font-bold text-foreground">Raadi xirmooyinka {providerName}</h2>
            <p className="text-xs text-muted-foreground">{rootPackage.name || rootPackage.package_name}</p>
          </div>
          <button type="button" onClick={close} className="rounded-full p-2 hover:bg-muted" aria-label="Xir">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {status !== 'done' && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground">Lambarka xirmada helaayo</label>
                <div className="flex items-center rounded-xl border border-border bg-background px-3">
                  <span className="text-sm font-semibold text-muted-foreground">+252</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel"
                    className="h-12 min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold outline-none"
                    placeholder="61XXXXXXX"
                    disabled={status === 'requesting' || status === 'waiting'}
                  />
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                onClick={requestDiscovery}
                disabled={status === 'requesting' || status === 'waiting'}
              >
                {status === 'requesting' || status === 'waiting' ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Raadinaya…</>
                ) : (
                  <><Search className="mr-2 h-4 w-4" /> Raadi xirmooyinka</>
                )}
              </Button>
            </>
          )}

          {message && (
            <div className={`rounded-xl border p-3 text-sm ${status === 'failed' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border bg-muted/40 text-foreground'}`}>
              {message}
            </div>
          )}

          {status === 'done' && (
            <div className="space-y-2">
              {packages.map((pkg) => {
                const selectable = !pkg.price_missing && pkg.selling_price != null;
                return (
                  <button
                    key={`${pkg.index}-${pkg.carrier_label || pkg.label}`}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectable && onSelect(pkg, normalizePhone(phone), discoveryId)}
                    className="w-full rounded-xl border border-border bg-background p-3 text-left disabled:opacity-55"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{pkg.label}</p>
                        {pkg.info_line1 && <p className="mt-1 text-xs text-muted-foreground">{pkg.info_line1}</p>}
                        {pkg.info_line2 && <p className="text-xs text-muted-foreground">{pkg.info_line2}</p>}
                        {!selectable && <p className="mt-1 text-xs font-semibold text-destructive">Qiimaha wali lama dejin</p>}
                      </div>
                      {pkg.selling_price != null && <span className="shrink-0 text-lg font-bold text-primary">${Number(pkg.selling_price).toFixed(2)}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {status === 'failed' && (
            <Button type="button" variant="outline" className="w-full" onClick={() => { setStatus('idle'); setMessage(''); }}>
              Mar kale isku day
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
