import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export type DiscoveryItem = {
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
  rootPackageId: string;
  receiverPhone: string;
  onCancel: () => void;
  onSelect: (item: DiscoveryItem, discoveryId: string) => void;
};

export default function DiscoverySearchOverlay({ open, rootPackageId, receiverPhone, onCancel, onSelect }: Props) {
  const [state, setState] = useState<'queue' | 'searching' | 'results' | 'failed'>('queue');
  const [ahead, setAhead] = useState(0);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [discoveryId, setDiscoveryId] = useState('');
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current != null) window.clearTimeout(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (state === 'results' || state === 'failed' || !open) return;
    const id = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [state, open]);

  useEffect(() => {
    if (state !== 'results' || secondsLeft <= 0) return;
    const id = window.setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [state, secondsLeft]);

  useEffect(() => {
    if (state === 'results' && secondsLeft <= 0) {
      setItems([]);
    }
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
      pollRef.current = window.setTimeout(() => void poll(id), 350);
    } catch (e: any) {
      setState('failed');
      setError(e?.message || 'Raadinta xirmooyinka way fashilantay.');
    }
  };

  const start = async () => {
    stopPolling();
    setState('queue');
    setItems([]);
    setError('');
    setElapsed(0);
    setDiscoveryId('');
    try {
      const { data, error: rpcError } = await (supabase as any).rpc('request_package_discovery', {
        p_root_package_id: rootPackageId,
        p_phone: receiverPhone,
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

  // Marka lambarka la galiyo, si toos ah ayaa baaritaanku u bilaabmaa.
  useEffect(() => {
    if (!open || !rootPackageId || !receiverPhone) return;
    void start();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rootPackageId, receiverPhone]);

  if (!open) return null;

  const expired = state === 'results' && secondsLeft <= 0;
  const cancel = () => {
    stopPolling();
    setItems([]);
    if (discoveryId) {
      void (supabase as any).rpc('release_discovery_session', { p_id: discoveryId });
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center bg-black/55 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-2xl max-h-[88vh] overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
          <h2 className="font-bold text-foreground">Xirmooyinka lambarka +252-{receiverPhone}</h2>
        </div>

        <div className="p-4 space-y-3">
          {(state === 'queue' || state === 'searching') && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="w-9 h-9 animate-spin text-primary" />
              {state === 'queue' ? (
                <>
                  <p className="font-bold text-foreground">Waxaad ku jirtaa safka</p>
                  {ahead > 0 && <p className="text-sm text-muted-foreground">{ahead} codsi ayaa kaa horreeya.</p>}
                </>
              ) : (
                <p className="font-bold text-foreground">Waa la baarayaa xirmooyinka…</p>
              )}
              <p className="text-xs text-muted-foreground">Lacag weli lama bixin — {elapsed}s</p>
              <Button variant="outline" onClick={cancel} className="mt-1 px-8">Jooji</Button>
            </div>
          )}

          {state === 'failed' && (
            <div className="space-y-3 py-6 text-center">
              <p className="font-bold text-destructive">Raadinta ma guulaysan</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={cancel}>Xir</Button>
                <Button className="flex-1" onClick={() => void start()}>Mar kale isku day</Button>
              </div>
            </div>
          )}

          {state === 'results' && (
            <>
              {expired ? (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-center space-y-2">
                  <p className="text-sm font-semibold text-destructive">Waqtigii xiriirku wuu dhamaaday.</p>
                  <Button size="sm" onClick={() => void start()}>Dib u baar</Button>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Dooro xirmada — waqtiga haray {secondsLeft}s
                  </p>
                </div>
              )}

              {items.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Xirmooyin lama helin.</p>}

              {items.map(item => {
                const priced = !item.price_missing && item.selling_price != null;
                const selectable = !expired && priced;
                return (
                  <button
                    key={`${item.index}-${item.carrier_label || item.label}`}
                    type="button"
                    disabled={!selectable}
                    onClick={() => { stopPolling(); onSelect(item, discoveryId); }}
                    className="w-full rounded-xl border border-border bg-background p-3 text-left disabled:opacity-70"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{priced ? item.label : (item.carrier_label || item.label)}</p>
                        {item.info_line1 && <p className="mt-1 text-xs text-muted-foreground">{item.info_line1}</p>}
                        {item.info_line2 && <p className="text-xs text-muted-foreground">{item.info_line2}</p>}
                      </div>
                      {priced && (
                        <span className="shrink-0 text-lg font-bold text-primary">${Number(item.selling_price).toFixed(2)}</span>
                      )}
                    </div>
                  </button>
                );
              })}

              <Button variant="outline" className="w-full" onClick={cancel}>Jooji</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
