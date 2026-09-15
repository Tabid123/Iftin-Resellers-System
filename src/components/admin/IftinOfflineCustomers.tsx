import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, Pencil, Power, RefreshCw, Search, Trash2, UserPlus, WifiOff, X, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { fetchIftinCatalog, mapProviders, resolveTenantId, type IftinCatalog } from '@/lib/iftinCatalog';
import { formatPrefixes, getAllowedPrefixes, matchesAllowedPrefix } from '@/lib/phonePrefixes';
import {
  deleteOfflineRegistration, listOfflineRegistrations, saveOfflineRegistration,
  type OfflineRegistration,
} from '@/lib/iftinOffline.functions';
import { registerOfflineCustomer } from '@/lib/iftinOfflineApi';


const digits = (p?: string | null) => String(p ?? '').replace(/\D/g, '').slice(-9);
const pretty = (p?: string | null) => (p ? `+252${digits(p)}` : '—');

const shortDate = (iso?: string | null) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Mogadishu' }).format(new Date(iso));
  } catch {
    return '—';
  }
};

const isToday = (iso?: string | null) => {
  if (!iso) return false;
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Mogadishu' }).format(d);
  try {
    return fmt(new Date(iso)) === fmt(new Date());
  } catch {
    return false;
  }
};

const INFO_KEY = 'iftin_offline_info_dismissed';

type FormState = { sender: string; receiver: string; providerId: string; notes: string };
const emptyForm: FormState = { sender: '', receiver: '', providerId: '', notes: '' };

type Row = OfflineRegistration & { __local?: boolean };
type Tab = 'all' | 'active' | 'inactive' | 'today';

const IftinOfflineCustomers: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const pushedRef = useRef<Set<string>>(new Set());


  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [catalog, setCatalog] = useState<IftinCatalog | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  useEffect(() => {
    try { setShowInfo(localStorage.getItem(INFO_KEY) !== '1'); } catch { /* noop */ }
  }, []);

  const dismissInfo = () => {
    setShowInfo(false);
    try { localStorage.setItem(INFO_KEY, '1'); } catch { /* noop */ }
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');

      // Iftin is the single source of truth — no local registrations are used.
      const iftinRes = await listOfflineRegistrations({ data: { tenantId } }).catch((e: any) => ({
        ok: false as const, status: 0, message: e?.message ?? 'Liiska lama soo dejin',
      }));

      if (!iftinRes.ok) throw new Error((iftinRes as any).message ?? 'Liiska lama soo dejin');
      setRows((iftinRes.data as OfflineRegistration[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Liiska lama soo dejin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void fetchIftinCatalog().then(setCatalog); }, []);
  useRealtimeRefresh(['offline_registrations'], () => { void load(true); }, 800);


  const providers = useMemo(() => (catalog ? mapProviders(catalog) : []), [catalog]);
  const providerName = useMemo(
    () => providers.find((p) => p.id === form.providerId)?.provider_name ?? null,
    [providers, form.providerId],
  );

  const receiverPrefixes = getAllowedPrefixes(providerName);
  const senderPrefixes = ['61', '77', '62', '68', '64', '71'];
  const receiverPrefixOk = matchesAllowedPrefix(form.receiver, receiverPrefixes);
  const senderPrefixOk = matchesAllowedPrefix(form.sender, senderPrefixes);

  const canSave =
    form.sender.length === 9 && senderPrefixOk &&
    form.receiver.length === 9 && receiverPrefixOk &&
    Boolean(form.providerId) && !saving;

  const openAdd = () => { setEditing(null); setForm(emptyForm); setFormOpen(true); };

  const openEdit = (r: Row) => {
    setEditing(r);
    setForm({
      sender: digits(r.sender_phone),
      receiver: digits(r.receiver_phone),
      providerId:
        providers.find((p) => p.id === r.provider_id)?.id ??
        providers.find((p) => p.provider_name?.toLowerCase() === String(r.provider_name ?? '').toLowerCase())?.id ??
        '',
      notes: r.notes ?? '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing?.__local) {
        const { error: upErr } = await supabase
          .from('offline_registrations')
          .update({
            sender_phone: form.sender,
            receiver_phone: form.receiver,
            provider_name: providerName,
          })
          .eq('id', String(editing.id));
        if (upErr) {
          toast({ title: 'Lama kaydin', description: upErr.message, variant: 'destructive' });
          return;
        }
        toast({ title: 'Waa la cusboonaysiiyay' });
        setFormOpen(false);
        await load(true);
        return;
      }

      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');
      const res = await saveOfflineRegistration({
        data: {
          tenantId,
          sender_phone: form.sender,
          receiver_phone: form.receiver,
          provider_id: form.providerId,
          ...(providerName ? { provider_name: providerName } : {}),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        },
      });
      if (!res.ok) {
        toast({ title: 'Lama diiwaan gelin', description: res.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Waa la diiwaan geliyay', description: `${pretty(form.sender)} → ${pretty(form.receiver)}` });
      setFormOpen(false);
      await load(true);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e?.message ?? 'Isku day mar kale', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: Row) => {
    if (!r.__local) {
      toast({ title: 'Ma suurtogalo', description: 'Diiwaanka Iftin lama beddeli karo halkan.', variant: 'destructive' });
      return;
    }
    const { error: upErr } = await supabase
      .from('offline_registrations')
      .update({ is_active: !(r.is_active !== false) })
      .eq('id', String(r.id));
    if (upErr) {
      toast({ title: 'Lama beddelin', description: upErr.message, variant: 'destructive' });
      return;
    }
    await load(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.__local) {
        const { error: delErr } = await supabase
          .from('offline_registrations')
          .delete()
          .eq('id', String(deleteTarget.id));
        if (delErr) {
          toast({ title: 'Lama tirtirin', description: delErr.message, variant: 'destructive' });
          return;
        }
        toast({ title: 'Waa la tirtiray' });
        setDeleteTarget(null);
        await load(true);
        return;
      }
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');
      const res = await deleteOfflineRegistration({
        data: {
          tenantId,
          ...(deleteTarget.id ? { id: deleteTarget.id } : {}),
          sender_phone: String(deleteTarget.sender_phone ?? ''),
        },
      });

      if (!res.ok) {
        toast({ title: 'Lama tirtirin', description: res.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Waa la tirtiray' });
      setDeleteTarget(null);
      await load(true);
    } catch (e: any) {
      toast({ title: 'Khalad', description: e?.message ?? 'Isku day mar kale', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const stats = useMemo(() => {
    const active = rows.filter((r) => r.is_active !== false).length;
    return {
      total: rows.length,
      active,
      inactive: rows.length - active,
      today: rows.filter((r) => isToday(r.created_at)).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.replace(/\D/g, '');
    return rows.filter((r) => {
      if (tab === 'active' && r.is_active === false) return false;
      if (tab === 'inactive' && r.is_active !== false) return false;
      if (tab === 'today' && !isToday(r.created_at)) return false;
      if (!q) return true;
      return digits(r.sender_phone).includes(q) || digits(r.receiver_phone).includes(q);
    });
  }, [rows, search, tab]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: stats.total },
    { key: 'active', label: 'Active', count: stats.active },
    { key: 'inactive', label: 'Inactive', count: stats.inactive },
    { key: 'today', label: 'Maanta', count: stats.today },
  ];

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {showInfo && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3 flex gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs leading-relaxed flex-1">
              Macmiilka lacagta uu ku diro lambarkan, haddii ay dhufaan lacagta, nidaamku si toos ah ayuu u
              xilminayaa xirmada lagu helo qiimaha lacagta. Adiga waxaad kaliya galisaa lambarka iyo shirkadda.
            </p>
            <button onClick={dismissInfo} aria-label="Xir" className="text-muted-foreground shrink-0">
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Stats - 1 row, scrollable on mobile */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, cls: 'text-foreground' },
          { label: 'Active', value: stats.active, cls: 'text-emerald-600' },
          { label: 'Inactive', value: stats.inactive, cls: 'text-orange-600' },
          { label: 'Maanta', value: stats.today, cls: 'text-primary' },
        ].map((s) => (
          <Card key={s.label} className="shadow-sm min-w-[calc(25%-0.6rem)] flex-1 sm:min-w-0">
            <CardContent className="p-3 sm:p-4 text-center">
              <p className={`text-xl sm:text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Offline Registration</h2>
          </div>

          <div className="space-y-2">
            {/* Search - full width on mobile */}
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8 h-9 w-full"
                placeholder="Search..."
                inputMode="numeric"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Filters - evenly spaced on mobile, natural width on desktop */}
            <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center">
              {tabs.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={tab === t.key ? 'default' : 'outline'}
                  className="h-9 w-full px-1 sm:w-auto sm:px-3"
                  onClick={() => setTab(t.key)}
                >
                  <span className="text-xs sm:text-sm">{t.label}</span>
                  <span className="hidden sm:inline ml-1">({t.count})</span>
                </Button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => void load()}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" className="h-9 flex-1 sm:flex-initial" onClick={openAdd}>
                <UserPlus className="h-4 w-4 mr-1" /> Cusub
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading ? (
            <div className="py-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin inline text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <WifiOff className="h-6 w-6 mx-auto mb-2 opacity-60" />
              Weli macmiil offline lama diiwaan gelin.
            </div>
          ) : (<>
            {/* Mobile: accordion cards */}
            <div className="sm:hidden space-y-2">
              {filtered.map((r, i) => {
                const active = r.is_active !== false;
                const key = String(r.id ?? r.sender_phone);
                const isOpen = expandedId === key;
                return (
                  <div
                    key={key}
                    className="border rounded-lg overflow-hidden bg-card"
                  >
                    <button
                      onClick={() => setExpandedId(isOpen ? null : key)}
                      className="w-full px-3 py-3 flex items-center gap-2 text-left"
                    >
                      <span className="text-primary font-medium w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sender</p>
                          <p className="text-sm font-mono truncate">{pretty(r.sender_phone)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Receiver</p>
                          <p className="text-sm font-mono truncate">{pretty(r.receiver_phone)}</p>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full font-normal text-xs hidden xs:inline-flex">
                          {r.provider_name || '—'}
                        </Badge>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-0 border-t bg-muted/20">
                        <div className="grid grid-cols-2 gap-3 py-3">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Shirkad</p>
                            <Badge variant="outline" className="rounded-full font-normal mt-0.5">
                              {r.provider_name || '—'}
                            </Badge>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Status</p>
                            <Badge
                              className={`rounded-full font-normal mt-0.5 ${
                                active
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-500'
                                  : 'bg-muted text-muted-foreground hover:bg-muted'
                              }`}
                            >
                              {active ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                          <div className="col-span-2">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Taarikh</p>
                            <p className="text-sm text-muted-foreground mt-0.5">{shortDate(r.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="h-9 flex-1" onClick={() => openEdit(r)}>
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                          </Button>
                          <Button variant="outline" size="sm" className="h-9 flex-1" onClick={() => void handleToggle(r)}>
                            <Power className="h-3.5 w-3.5 mr-1.5" /> {active ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button variant="destructive" size="icon" className="h-9 w-9 shrink-0" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left font-medium px-4 py-3">#</th>
                    <th className="text-left font-medium px-4 py-3">Sender</th>
                    <th className="text-left font-medium px-4 py-3">Receiver</th>
                    <th className="text-left font-medium px-4 py-3">Shirkad</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-left font-medium px-4 py-3">Taarikh</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const active = r.is_active !== false;
                    return (
                      <tr key={String(r.id ?? r.sender_phone)} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 text-primary font-medium">{i + 1}</td>
                        <td className="px-4 py-3 font-mono">{pretty(r.sender_phone)}</td>
                        <td className="px-4 py-3 font-mono">{pretty(r.receiver_phone)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="rounded-full font-normal">
                            {r.provider_name || '—'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            className={`rounded-full font-normal ${
                              active
                                ? 'bg-emerald-500 text-white hover:bg-emerald-500'
                                : 'bg-muted text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            {active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{shortDate(r.created_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => void handleToggle(r)}>
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(r)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>)}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Wax ka beddel' : 'Diiwaangeli Cusub'}</DialogTitle>
            <DialogDescription>
              Xirmada si otomaatig ah baa loo xilmiyaa qiimaha lacagta macmiilku soo diro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Sender Phone</Label>
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground shrink-0 border rounded-l-md px-3 py-2 bg-muted/40">+252</span>
                <Input
                  className="rounded-l-none"
                  inputMode="numeric"
                  placeholder="61xxxxxxx"
                  value={form.sender}
                  onChange={(e) => setForm((f) => ({ ...f, sender: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                />
              </div>
              {form.sender.length > 0 && !senderPrefixOk && (
                <p className="text-xs text-destructive">Prefix-ka waa: {formatPrefixes(senderPrefixes)}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Receiver Phone</Label>
              <div className="flex items-center">
                <span className="text-sm text-muted-foreground shrink-0 border rounded-l-md px-3 py-2 bg-muted/40">+252</span>
                <Input
                  className="rounded-l-none"
                  inputMode="numeric"
                  placeholder={receiverPrefixes[0] ? `${receiverPrefixes[0]}xxxxxxx` : '61xxxxxxx'}
                  value={form.receiver}
                  onChange={(e) => setForm((f) => ({ ...f, receiver: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                />
              </div>
              {form.receiver.length > 0 && !receiverPrefixOk && (
                <p className="text-xs text-destructive">
                  Lambarka {providerName} waa inuu ku bilaabmaa: {formatPrefixes(receiverPrefixes)}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={form.providerId}
                onValueChange={(v) => setForm((f) => ({ ...f, providerId: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <UserPlus className="h-4 w-4 mr-1" />}
              Diiwaangeli
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ma tirtiraysaa?</AlertDialogTitle>
            <AlertDialogDescription>
              {pretty(deleteTarget?.sender_phone)} mar dambe si otomaatig ah looma gaarsiinayo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Maya</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void handleDelete(); }} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Haa, tirtir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default IftinOfflineCustomers;
