import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Clock3, Loader2, Send, Server, Wallet } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import { formatTimeAgo } from './simple/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Package = { id: string; package_name: string; data_amount: string; selling_price: number; cost_price: number };
type Status = { configured: boolean; ready: boolean; balance: number | null; balanceAt: string | null };
function localSomlinkPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('252') ? digits.slice(3) : digits;
}
function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (n) => n.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
function friendlyError(value: string) {
  const translations: Record<string, string> = {
    somlink_api_not_connected_or_active: 'Somlink API ma aha Connected + Active.',
    somlink_receiver_must_be_64_nine_digits: 'Somlink wuxuu aqbalaa 64XXXXXXX oo keliya.',
    somlink_package_unavailable_or_invalid: 'Xirmada waa Inactive ama bundle/qiimo khaldan ayay leedahay.',
    demo_tenant_live_delivery_blocked: 'Demo tenant looma oggola diris dhab ah.',
    manual_delivery_permission_required: 'Oggolaanshaha Manual Delivery ma haysatid.',
    not_authorized_for_tenant: 'Tenant-kan maamulkiisa lama xaqiijin.',
  };
  return Object.entries(translations).find(([key]) => value.includes(key))?.[1] || value;
}

/** A virtual API balance/SIM-like card; never pretends to be a physical Android SIM. */
export function SomlinkApiDeviceCard({ isSo }: { isSo: boolean }) {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;
  const { can, loadingPermissions } = useAdminPermissions();
  const [expanded, setExpanded] = useState(true);
  const [open, setOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [packageId, setPackageId] = useState('');
  const [sending, setSending] = useState(false);
  const requestRef = useRef<string | null>(null);

  const status = useQuery({
    queryKey: ['somlink-api-device', tenantId],
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<Status> => {
      const { data, error } = await (supabase as any).rpc('somlink_manual_device_status', {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return {
        configured: data?.configured === true,
        ready: data?.ready === true,
        balance: typeof data?.balance === 'number' && Number.isFinite(data.balance) ? data.balance : null,
        balanceAt: data?.balance_at || null,
      };
    },
    staleTime: 15_000, refetchInterval: 30_000,
    refetchOnWindowFocus: true, refetchOnReconnect: true,
  });

  const packages = useQuery({
    queryKey: ['somlink-api-manual-packages', tenantId],
    enabled: Boolean(tenantId && open),
    queryFn: async (): Promise<Package[]> => {
      const { data: providers, error: pError } = await supabase.from('providers_config')
        .select('id,provider_name').eq('tenant_id', tenantId!);
      if (pError) throw pError;
      const ids = (providers || []).filter((p) => p.provider_name.trim().toLowerCase() === 'somlink').map((p) => p.id);
      if (!ids.length) return [];
      const { data, error } = await supabase.from('data_packages_config')
        .select('id,package_name,data_amount,cost_price,selling_price')
        .eq('tenant_id', tenantId!).in('provider_id', ids)
        .eq('is_active', true).eq('is_discovery_root', false)
        .not('somlink_bundle_id', 'is', null)
        .gt('cost_price', 0).gt('selling_price', 0.01)
        .order('display_order', { ascending: true }).limit(500);
      if (error) throw error;
      return (data || []).map((p) => ({
        ...p, selling_price: Number(p.selling_price), cost_price: Number(p.cost_price),
      }));
    },
  });

  const phone = localSomlinkPhone(recipient);
  const validPhone = /^64\d{7}$/.test(phone);
  const chosen = packages.data?.find((p) => p.id === packageId);
  const canManual = !loadingPermissions && can('manual_transactions');
  const ready = status.data?.ready === true;

  function closeDialog(next: boolean) {
    if (sending) return;
    setOpen(next);
    if (!next) { setRecipient(''); setPackageId(''); requestRef.current = null; }
  }

  async function sendManual(event: React.FormEvent) {
    event.preventDefault();
    if (!tenantId || !canManual || !ready || !validPhone || !chosen || sending) return;
    const warning = isSo
      ? 'Dir ' + chosen.package_name + ' → ' + phone + '? Somlink wallet waxaa laga jarayaa $' + chosen.cost_price.toFixed(2) + '. Lacag bixinta macaamilka halkan laguma xaqiijinayo.'
      : 'Send ' + chosen.package_name + ' → ' + phone + '? Somlink wallet charge: $' + chosen.cost_price.toFixed(2) + '. Customer payment is not verified here.';
    if (!window.confirm(warning)) return;

    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const { data, error } = await (supabase as any).rpc('create_manual_somlink_delivery', {
        p_tenant_id: tenantId,
        p_package_id: chosen.id,
        p_receiver_phone: phone,
        p_request_id: requestRef.current,
      });
      if (error) throw error;
      toast.success(isSo
        ? 'Dalab Somlink ah ayaa la gudbiyey (ID ' + String(data).slice(0, 8) + '). Guusha ka hubi Dalabyada.'
        : 'Somlink delivery queued (ID ' + String(data).slice(0, 8) + '). Check Orders for success.');
      // Close after the server accepts the queue request; the success state is
      // not a delivery confirmation (that arrives asynchronously in Orders).
      setOpen(false);
      setRecipient('');
      setPackageId('');
      requestRef.current = null;
      void status.refetch();
    } catch (error: any) {
      // Retain the SAME idempotency key on timeout/retry: never charge twice.
      toast.error(friendlyError(error?.message || 'Somlink request failed'));
    } finally { setSending(false); }
  }

  if (!tenantId || (status.isSuccess && !status.data.configured)) return null;
  return (
    <>
      <section aria-label="Somlink API virtual device"
        className={'overflow-hidden rounded-xl text-white shadow-sm ' + (ready ? 'bg-emerald-600 dark:bg-emerald-700' : 'bg-slate-600 dark:bg-slate-700')}>
        <button type="button" onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded} className="flex w-full items-center gap-3 p-3 text-left">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><Server className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-sm font-bold">Somlink API <span className="rounded bg-white/15 px-1.5 py-0.5 text-[9px]">VIRTUAL</span></div>
            <p className="mt-0.5 text-[11px] opacity-90">
              {status.isLoading ? 'Checking...' : status.isError ? 'Status lama hubin' : ready ? '● CONNECTED · ACTIVE' : '● INACTIVE'}
            </p>
          </div>
          <ChevronDown className={'h-4 w-4 transition-transform ' + (expanded ? 'rotate-180' : '')} />
        </button>

        {expanded && (
          <div className="space-y-2 bg-black/10 px-3 pb-3 pt-1">
            <div className="rounded-lg bg-white/10 p-3">
              <div className="flex items-center gap-1.5 text-[11px] opacity-90">
                <Wallet className="h-3.5 w-3.5" />
                {isSo ? 'Haraagii ugu dambeeyey' : 'Last reported balance'}
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {can('view_profit')
                  ? (status.data?.balance == null ? '—' : '$' + status.data.balance.toFixed(2))
                  : (isSo ? 'Xog maaliyadeed oo xaddidan' : 'Restricted')}
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-85">
                <Clock3 className="h-3 w-3" />
                {status.data?.balanceAt ? formatTimeAgo(status.data.balanceAt) : (isSo ? 'Weli xog lama hayo' : 'No data')}
                <span>· {isSo ? 'Ma aha live balance' : 'Not a live balance'}</span>
              </div>
            </div>
            {status.isError && <div role="alert" className="text-xs">Somlink status lama soo akhrin karo.</div>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] opacity-90">{isSo ? 'Dirista: Somlink API' : 'Delivery: Somlink API'}</span>
              <Button type="button" size="sm" disabled={!ready || !canManual || status.isLoading}
                onClick={() => setOpen(true)} className="h-9 bg-white text-emerald-800 hover:bg-white/90">
                <Send className="mr-1.5 h-3.5 w-3.5" /> {isSo ? 'Dalab Manual' : 'Manual Send'}
              </Button>
            </div>
            {!canManual && !loadingPermissions && (
              <p className="text-[10px] opacity-90">{isSo ? 'Manual Delivery oggolaansho ayuu u baahan yahay.' : 'Permission required for manual delivery.'}</p>
            )}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>{isSo ? 'Somlink — Dalab Manual' : 'Somlink — Manual Send'}</DialogTitle>
            <DialogDescription>
              {isSo ? 'Xulo xirmo iyo lambar 64XXXXXXX; Somlink wallet-ka ayaa laga jarayaa cost price-ka.'
                : 'Choose a bundle and recipient 64XXXXXXX; charges your Somlink wallet.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={sendManual}>
            <div className="space-y-1.5">
              <Label htmlFor="somlink-recipient">Recipient · 64XXXXXXX</Label>
              <Input id="somlink-recipient" type="tel" inputMode="numeric" maxLength={15}
                value={recipient} onChange={(e) => { setRecipient(e.target.value); requestRef.current = null; }}
                placeholder="64XXXXXXX" />
              {recipient && !validPhone && <p className="text-xs text-destructive">Somlink: 64XXXXXXX (9 digits).</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="somlink-package">{isSo ? 'Xirmada' : 'Bundle'}</Label>
              <select id="somlink-package" value={packageId}
                onChange={(e) => { setPackageId(e.target.value); requestRef.current = null; }}
                disabled={packages.isLoading || packages.isError}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">{packages.isLoading ? 'Loading...' : (isSo ? 'Dooro xirmada' : 'Choose bundle')}</option>
                {(packages.data || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.package_name + ' (' + p.data_amount + ') — $' + p.cost_price.toFixed(2)}
                  </option>
                ))}
              </select>
              {packages.isError && <p role="alert" className="text-xs text-destructive">Xirmooyinka lama soo qaadi karo.</p>}
              {!packages.isLoading && packages.data?.length === 0 && <p className="text-xs text-muted-foreground">Xirmo Active ah lama helin.</p>}
            </div>
            {chosen && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span>{isSo ? 'Somlink ka jaraya' : 'Somlink charge'}</span>
                  <strong>{'$' + chosen.cost_price.toFixed(2)}</strong>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSo ? 'Lacag-bixinta macaamiilka laguma xaqiijinayo.' : 'Customer payment is not confirmed.'}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={sending} onClick={() => closeDialog(false)}>{isSo ? 'Jooji' : 'Cancel'}</Button>
              <Button type="submit" disabled={!ready || !validPhone || !chosen || sending}>
                {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
                {isSo ? 'U Dir Somlink' : 'Send'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
