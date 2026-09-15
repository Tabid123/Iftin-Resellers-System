import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import {
  StatCardsRow, FilterRow, SearchInput, InvoiceAccordionContent,
  ActionBtn, LazyFallback, EmptyState, formatPhone, formatDate, formatTime, normalizePhone,
  Users, UserPlus, Phone, Calendar, DollarSign, CheckCircle, XCircle, Package, ChevronDown, Power, Trash2, Globe, Ban, Plus,
  Smartphone,
} from './shared';
import { formatTimeAgo } from './shared';
import { Edit } from 'lucide-react';
import { listOfflineCustomers, updateOfflineCustomer, deleteOfflineCustomer } from '@/lib/iftinOfflineApi';
import { saveOfflineRegistration } from '@/lib/offlineRegistration';
import { EditDeviceDialog } from '../EditDeviceDialog';
import { DeleteDeviceDialog } from '../DeleteDeviceDialog';

// ========== CUSTOMERS ==========
export const CustomersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [phones, setPhones] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [phonesRes, ordersRes, regsRes] = await Promise.all([
      supabase.from('verified_phones').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('customer_phone, created_at, selling_price').order('created_at', { ascending: false }).limit(2000),
      supabase.from('offline_registrations').select('sender_phone, created_at').order('created_at', { ascending: false }).limit(2000),
    ]);

    const orderRows = ordersRes.data || [];
    // Macaamiisha: lambarada la xaqiijiyay, kuwa dalab sameeyay, iyo diiwaangelinta offline-ka.
    const rows: any[] = (phonesRes.data || []).map(p => ({ ...p, __verified: true }));
    const seen = new Set(rows.map(r => normalizePhone(r.phone_number)));

    for (const o of orderRows) {
      const norm = normalizePhone(o.customer_phone);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      rows.push({ id: `ord-${norm}`, phone_number: norm, created_at: o.created_at, __verified: false, __source: 'order' });
    }

    for (const r of (regsRes.data || [])) {
      const norm = normalizePhone(r.sender_phone);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      rows.push({ id: `off-${norm}`, phone_number: norm, created_at: r.created_at, __verified: false, __source: 'offline' });
    }

    setPhones(rows);
    setOrders(orderRows);
    setLoading(false);
  }, []);


  useEffect(() => { loadData(); }, [loadData]);
  useRealtimeRefresh(['verified_phones', 'orders', 'offline_registrations'], loadData, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const allBuyerPhones = new Set(orders.map(o => normalizePhone(o.customer_phone)));
  const todayRegistered = phones.filter(p => new Date(p.created_at) >= startOfToday);
  const activeCustomers = phones.filter(p => allBuyerPhones.has(normalizePhone(p.phone_number)));
  const inactiveCustomers = phones.filter(p => !allBuyerPhones.has(normalizePhone(p.phone_number)));
  const purchasedToday = phones.filter(p => {
    const todayOrders = orders.filter(o => new Date(o.created_at) >= startOfToday);
    return new Set(todayOrders.map(o => normalizePhone(o.customer_phone))).has(normalizePhone(p.phone_number));
  });

  const getFiltered = () => {
    let filtered = phones;
    if (filter === 'today') filtered = todayRegistered;
    else if (filter === 'active') filtered = activeCustomers;
    else if (filter === 'inactive') filtered = inactiveCustomers;
    else if (filter === 'purchasedToday') filtered = purchasedToday;
    if (search) filtered = filtered.filter(p => p.phone_number.includes(search));
    return filtered;
  };

  const deleteCustomer = async (id: string, phone: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error(isSo ? 'Macmiilkan lama tirtiri karo' : 'This customer cannot be deleted');
      return;
    }
    if (!confirm(isSo ? `Ma hubtaa inaad tirtirto ${phone}?` : `Delete ${phone}?`)) return;
    const { error } = await supabase.from('verified_phones').delete().eq('id', id);
    if (error) { toast.error('Error'); return; }
    setPhones(prev => prev.filter(p => p.id !== id));
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const getCustomerStats = (phone: string) => {
    const norm = normalizePhone(phone);
    const customerOrders = orders.filter(o => normalizePhone(o.customer_phone) === norm);
    const totalSpent = customerOrders.reduce((s, o) => s + Number(o.selling_price || 0), 0);
    return { orderCount: customerOrders.length, totalSpent };
  };

  const filteredCustomers = getFiltered();

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: phones.length, color: 'bg-purple-500', icon: Users },
        { label: isSo ? 'Cusub Maanta' : 'New Today', value: todayRegistered.length, color: 'bg-green-500', icon: UserPlus },
        { label: isSo ? 'Maanta libsatay' : 'Bought Today', value: purchasedToday.length, color: 'bg-blue-500', icon: Package },
        { label: isSo ? 'Aan libsan' : 'Never Bought', value: inactiveCustomers.length, color: 'bg-orange-500', icon: XCircle },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: phones.length },
        { key: 'today', label: isSo ? 'Cusub' : 'New', count: todayRegistered.length },
        { key: 'active', label: isSo ? 'Firfircoon' : 'Active', count: activeCustomers.length },
        { key: 'purchasedToday', label: isSo ? 'Maanta' : 'Today', count: purchasedToday.length },
        { key: 'inactive', label: isSo ? 'Aan Iibsan' : 'Inactive', count: inactiveCustomers.length },
      ]} activeKey={filter} onSelect={setFilter} activeColor="bg-teal-500" />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />
      {loading ? <LazyFallback /> : filteredCustomers.length === 0 ? <EmptyState message={isSo ? 'Wax macaamiil ah lama helin' : 'No customers found'} /> : (
        <div className="space-y-2">
          {filteredCustomers.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            const hasOrders = allBuyerPhones.has(normalizePhone(item.phone_number));
            const isNewToday = new Date(item.created_at) >= startOfToday;
            const stats = isExpanded ? getCustomerStats(item.phone_number) : null;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">+252{formatPhone(item.phone_number)}</div>
                      <div className="text-[11px] text-gray-400">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isNewToday && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{isSo ? 'Cusub' : 'New'}</span>}
                    {hasOrders ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">{isSo ? 'Active' : 'Active'}</span> : <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">Inactive</span>}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: Phone, label: isSo ? 'Lambarka' : 'Phone', value: `+252${item.phone_number}`, color: 'text-purple-500' },
                    { icon: Calendar, label: isSo ? 'Diiwaangelintu' : 'Registered', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                    ...(item.last_login_at ? [{ icon: Calendar, label: isSo ? 'Gelitiin Danbe' : 'Last Login', value: `${formatDate(item.last_login_at)} ${formatTime(item.last_login_at)}`, color: 'text-blue-500' }] : []),
                    ...(stats ? [
                      { icon: Package, label: isSo ? 'Dalabyada' : 'Orders', value: `${stats.orderCount}`, color: 'text-cyan-500' },
                      { icon: DollarSign, label: isSo ? 'Ku bixiyay' : 'Total Spent', value: `$${stats.totalSpent.toFixed(2)}`, color: 'text-emerald-500' },
                    ] : []),
                  ]} actions={<ActionBtn onClick={() => deleteCustomer(item.id, item.phone_number)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ========== OFFLINE REGISTRATIONS ==========
export const OfflineRegistrationsCustomView = ({ isSo }: { isSo: boolean }) => {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newReg, setNewReg] = useState({ sender_phone: '', receiver_phone: '', provider_name: '' });
  const [providerList, setProviderList] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('providers_config').select('id, provider_name').eq('is_active', true)
      .order('display_order')
      .then(({ data }) => setProviderList(data || []));
  }, []);

  // Diiwaanka offline-ka waxaa lagu keydiyaa database-ka maxalliga ah (dadka
  // iskood isu diiwaan geliyay). Tenant-yada Iftin partner-ka ah oo keliya ayaa
  // sidoo kale liiska Iftin lagu daraa — key la'aan ma aha khalad.
  const loadRegs = useCallback(async () => {
    setLoading(true);
    const { data: local, error } = await supabase
      .from('offline_registrations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(isSo ? 'Liiska lama soo dejin' : 'Failed to load');

    const rows: any[] = (local ?? []).map(r => ({ ...r, __local: true }));

    const remote = await listOfflineCustomers();
    if (remote.ok) {
      const list = (remote.data?.registrations ?? remote.data) as any[];
      const seen = new Set(rows.map(r => `${normalizePhone(r.sender_phone)}|${normalizePhone(r.receiver_phone)}`));
      (Array.isArray(list) ? list : []).forEach((r: any) => {
        const key = `${normalizePhone(r.sender_phone)}|${normalizePhone(r.receiver_phone)}`;
        if (!seen.has(key)) { seen.add(key); rows.push({ ...r, __local: false }); }
      });
    } else if (remote.error && remote.error !== 'missing_api_key' && remote.error !== 'missing_tenant') {
      toast.error(remote.message ?? (isSo ? 'Iftin liiska lama soo dejin' : 'Iftin list failed'));
    }

    setRegs(rows);
    setLoading(false);
  }, [isSo]);

  useEffect(() => { loadRegs(); }, [loadRegs]);
  useRealtimeRefresh(['offline_registrations'], loadRegs, 800);

  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const activeRegs = regs.filter(r => r.is_active).length;
  const inactiveRegs = regs.filter(r => !r.is_active).length;
  const todayRegs = regs.filter(r => new Date(r.created_at) >= startOfToday).length;

  const getFiltered = () => {
    let filtered = regs;
    if (filter === 'active') filtered = filtered.filter(r => r.is_active);
    else if (filter === 'inactive') filtered = filtered.filter(r => !r.is_active);
    else if (filter === 'today') filtered = filtered.filter(r => new Date(r.created_at) >= startOfToday);
    if (search) filtered = filtered.filter(r => r.sender_phone?.includes(search) || r.receiver_phone?.includes(search));
    return filtered;
  };

  const toggleStatus = async (id: string, _currentStatus: boolean) => {
    const row = regs.find((r) => r.id === id);
    if (!row) return;
    if (row.__local) {
      const { error } = await supabase
        .from('offline_registrations')
        .update({ is_active: !(row.is_active !== false) })
        .eq('id', id);
      if (error) { toast.error(error.message); return; }
      await loadRegs();
      toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Status updated');
      return;
    }
    const res = await updateOfflineCustomer({
      id,
      senderPhone: row.sender_phone,
      receiverPhone: row.receiver_phone,
      providerName: row.provider_name ?? null,
    });
    if (!res.ok) { toast.error(res.message ?? 'Khalad'); return; }
    await loadRegs();
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Status updated');
  };

  const deleteReg = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto?' : 'Delete this registration?')) return;
    const row = regs.find((r) => r.id === id);
    if (row?.__local) {
      const { error } = await supabase.from('offline_registrations').delete().eq('id', id);
      if (error) { toast.error(error.message); return; }
      setRegs(prev => prev.filter(r => r.id !== id));
      toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
      return;
    }
    const res = await deleteOfflineCustomer({ id });
    if (!res.ok) { toast.error(res.message ?? 'Khalad'); return; }
    setRegs(prev => prev.filter(r => r.id !== id));
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
  };

  const addReg = async () => {
    if (!newReg.sender_phone || !newReg.receiver_phone) { toast.error(isSo ? 'Buuxi meelaha' : 'Fill required fields'); return; }
    if (!newReg.provider_name) { toast.error(isSo ? 'Fadlan dooro shirkadda' : 'Please choose a provider'); return; }
    const chosen = providerList.find(p => p.provider_name === newReg.provider_name);
    const res = await saveOfflineRegistration({
      senderPhone: newReg.sender_phone,
      receiverPhone: newReg.receiver_phone,
      providerName: newReg.provider_name,
      providerId: chosen?.id ?? null,
    });
    if (!res.ok) {
      toast.error(`${res.message ?? 'Khalad'}${res.error ? ` (${res.error})` : ''}`);
      return;
    }
    setNewReg({ sender_phone: '', receiver_phone: '', provider_name: '' });
    setShowAdd(false);
    await loadRegs();
    toast.success(isSo ? 'Waa lagu daray' : 'Added');
  };

  const filteredRegs = getFiltered();

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: regs.length, color: 'bg-purple-500', icon: Users },
        { label: 'Active', value: activeRegs, color: 'bg-green-500', icon: CheckCircle },
        { label: 'Inactive', value: inactiveRegs, color: 'bg-amber-500', icon: XCircle },
        { label: isSo ? 'Maanta' : 'Today', value: todayRegs, color: 'bg-sky-500', icon: UserPlus },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: regs.length },
        { key: 'active', label: 'Active', count: activeRegs },
        { key: 'inactive', label: 'Inactive', count: inactiveRegs },
        { key: 'today', label: isSo ? 'Maanta' : 'Today', count: todayRegs },
      ]} activeKey={filter} onSelect={setFilter} activeColor="bg-orange-500" />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi sender ama receiver...' : 'Search...'} />
      <button onClick={() => setShowAdd(!showAdd)} className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
        <Plus className="w-4 h-4" /> {isSo ? 'Diiwaangelin Cusub' : 'Add New Registration'}
      </button>
      {showAdd && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2 animate-in slide-in-from-top-2">
          <input type="tel" inputMode="numeric" pattern="[0-9]*" value={newReg.sender_phone} onChange={e => setNewReg(p => ({...p, sender_phone: e.target.value.replace(/\D/g, '')}))} placeholder={isSo ? 'Lambarka Diraha' : 'Sender Phone'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <input type="tel" inputMode="numeric" pattern="[0-9]*" value={newReg.receiver_phone} onChange={e => setNewReg(p => ({...p, receiver_phone: e.target.value.replace(/\D/g, '')}))} placeholder={isSo ? 'Lambarka Qaataha' : 'Receiver Phone'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
          <select
            value={newReg.provider_name}
            onChange={e => setNewReg(p => ({ ...p, provider_name: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none"
          >
            <option value="">{isSo ? 'Dooro shirkadda *' : 'Choose provider *'}</option>
            {providerList.map(p => (
              <option key={p.id} value={p.provider_name}>{p.provider_name}</option>
            ))}
          </select>
          <button onClick={addReg} className="w-full py-2 bg-green-500 text-white rounded-lg text-sm font-medium active:bg-green-600">
            <Plus className="w-3.5 h-3.5 inline mr-1" /> {isSo ? 'Ku Dar' : 'Add'}
          </button>
        </div>
      )}
      {loading ? <LazyFallback /> : filteredRegs.length === 0 ? <EmptyState message={isSo ? 'Wax lama helin' : 'No registrations found'} /> : (
        <div className="space-y-2">
          {filteredRegs.map((item, idx) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-[10px] font-bold text-purple-400 w-5">#{idx + 1}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">{formatPhone(item.sender_phone)}</div>
                      <div className="text-[11px] text-gray-400">→ {formatPhone(item.receiver_phone)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{item.is_active ? 'Active' : 'Off'}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                    { icon: Phone, label: 'Sender', value: `+252${item.sender_phone}`, color: 'text-purple-500' },
                    { icon: Phone, label: 'Receiver', value: `+252${item.receiver_phone}`, color: 'text-green-500' },
                    { icon: Globe, label: 'Provider', value: item.provider_name || '—', color: 'text-blue-500' },
                    { icon: Calendar, label: isSo ? 'Taariikhda' : 'Date', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                    { icon: Power, label: 'Status', value: item.is_active ? 'Active' : 'Inactive', color: item.is_active ? 'text-green-500' : 'text-red-500' },
                  ]} actions={
                    <>
                      <ActionBtn onClick={() => toggleStatus(item.id, item.is_active)} icon={Power} label={item.is_active ? 'Disable' : 'Enable'} variant="warning" />
                      <ActionBtn onClick={() => deleteReg(item.id)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" />
                    </>
                  } />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ========== DEVICES ==========
export const DevicesCustomView = ({ isSo }: { isSo: boolean }) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<any>(null);
  const [deleteDevice, setDeleteDevice] = useState<any>(null);

  const loadDevices = useCallback(async () => {
    const [devRes, balRes] = await Promise.all([
      supabase.from('android_devices').select('*').is('archived_at', null).order('last_ping_at', { ascending: false }),
      supabase.from('sim_balances').select('*'),
    ]);
    setDevices(devRes.data || []);
    setBalances(balRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadDevices(); }, [loadDevices]);
  useRealtimeRefresh(['android_devices', 'sim_balances'], loadDevices, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  const OFFLINE_THRESHOLD = 3 * 60 * 1000;
  const onlineDevices = devices.filter(d => d.last_ping_at && (Date.now() - new Date(d.last_ping_at).getTime()) < OFFLINE_THRESHOLD);
  const offlineDevices = devices.filter(d => !d.last_ping_at || (Date.now() - new Date(d.last_ping_at).getTime()) >= OFFLINE_THRESHOLD);

  const toggleDevice = async (id: string, currentStatus: boolean) => {
    await supabase.from('android_devices').update({ is_active: !currentStatus }).eq('id', id);
    setDevices(prev => prev.map(d => d.id === id ? { ...d, is_active: !d.is_active } : d));
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Updated');
  };

  const setPrimaryHormuud = async (id: string, makePrimary: boolean) => {
    try {
      if (makePrimary) {
        // Unset all others first (UNIQUE partial index allows only one)
        await supabase.from('android_devices').update({ is_primary_hormuud_sim: false }).eq('is_primary_hormuud_sim', true);
      }
      const { error } = await supabase.from('android_devices').update({ is_primary_hormuud_sim: makePrimary }).eq('id', id);
      if (error) throw error;
      toast.success(isSo
        ? (makePrimary ? 'Hormuud SIM-kan ayaa loo qoondeeyay primary' : 'Primary Hormuud SIM waa la furay')
        : (makePrimary ? 'Set as primary Hormuud SIM' : 'Removed primary Hormuud SIM'));
      loadDevices();
    } catch (e: any) {
      toast.error(e.message || 'Failed');
    }
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: devices.length, icon: Smartphone, color: 'bg-purple-500' },
        { label: 'Online', value: onlineDevices.length, icon: CheckCircle, color: 'bg-green-500' },
        { label: 'Offline', value: offlineDevices.length, icon: XCircle, color: 'bg-red-500' },
      ]} />
      {loading ? <LazyFallback /> : devices.length === 0 ? <EmptyState message={isSo ? 'Wax aalad ah lama helin' : 'No devices found'} /> : (
        <div className="space-y-2">
          {devices.map((item) => {
            const isOnline = item.last_ping_at && (Date.now() - new Date(item.last_ping_at).getTime()) < OFFLINE_THRESHOLD;
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className={`rounded-xl overflow-hidden shadow-sm ${isOnline ? 'bg-green-500' : 'bg-red-400'} text-white`}>
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full p-3 flex items-center gap-3 text-left">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isOnline ? 'bg-green-600' : 'bg-red-500'}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5 flex-wrap">
                      {item.device_name}
                      {item.is_primary_hormuud_sim && (
                        <span className="text-[9px] bg-yellow-300 text-yellow-900 px-1.5 py-0.5 rounded-full font-bold">★ HORMUUD</span>
                      )}
                    </div>
                    <div className="text-xs opacity-80">{isOnline ? 'ONLINE' : 'OFFLINE'} · {formatTimeAgo(item.last_ping_at)}</div>
                  </div>
                  <ChevronDown className={`w-4 h-4 opacity-70 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isExpanded && (
                  <div className={`${isOnline ? 'bg-green-600' : 'bg-red-500'} px-3 pb-3 pt-1 space-y-2 animate-in slide-in-from-top-1 duration-150`}>
                    {/* SIM Balances */}
                    {(() => {
                      const devBalances = balances.filter(b => b.device_id === item.id);
                      const sim1Balances = devBalances.filter(b => b.sim_slot === 1);
                      const sim2Balances = devBalances.filter(b => b.sim_slot === 2);
                      const renderBal = (bals: any[], simLabel: string, provider: string) => {
                        if (bals.length === 0) return null;
                        const evc = bals.find(b => b.balance_type === 'evc_plus');
                        const evoucher = bals.find(b => b.balance_type === 'evoucher');
                        return (
                          <div className="bg-white/10 rounded-lg p-2">
                            <div className="text-[10px] opacity-70 font-bold mb-1">{simLabel} ({provider})</div>
                            <div className="flex gap-3 text-xs">
                              {evc && <div>EVC+: <span className="font-bold">${evc.balance?.toFixed(2)}</span></div>}
                              {evoucher && <div>E-Voucher: <span className="font-bold">${evoucher.balance?.toFixed(2)}</span></div>}
                              {!evc && !evoucher && <div className="opacity-50">—</div>}
                            </div>
                            {(evc || evoucher) && <div className="text-[9px] opacity-50 mt-0.5">{formatTimeAgo((evc || evoucher).last_updated)}</div>}
                          </div>
                        );
                      };
                      return (
                        <div className="space-y-1">
                          {renderBal(sim1Balances, 'SIM 1', item.sim1_provider || item.provider_name || '—')}
                          {renderBal(sim2Balances, 'SIM 2', item.sim2_provider || '—')}
                          {sim1Balances.length === 0 && sim2Balances.length === 0 && (
                            <div className="bg-white/10 rounded-lg p-2 text-xs opacity-50">{isSo ? 'Balance lama helin' : 'No balance data'}</div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-white/10 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-70">SIM 1 · {item.sim1_provider || item.provider_name || '—'}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${item.sim1_enabled === false ? 'bg-red-900/40' : 'bg-white/20'}`}>
                  {item.sim1_enabled === false ? (isSo ? 'XIRAN' : 'OFF') : (isSo ? 'FURAN' : 'ON')}
                </span>
              </div>
              <div className="font-medium">{item.sim_number}</div>
              <div className="mt-0.5 text-[10px] opacity-80">Priority: {item.sim1_priority ?? 1}</div>
            </div>
                      {item.sim2_number && <div className="rounded-lg bg-white/10 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] opacity-70">SIM 2 · {item.sim2_provider || '—'}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${item.sim2_enabled === false ? 'bg-red-900/40' : 'bg-white/20'}`}>
                  {item.sim2_enabled === false ? (isSo ? 'XIRAN' : 'OFF') : (isSo ? 'FURAN' : 'ON')}
                </span>
              </div>
              <div className="font-medium">{item.sim2_number}</div>
              <div className="mt-0.5 text-[10px] opacity-80">Priority: {item.sim2_priority ?? 1}</div>
            </div>}
                      {item.battery_level != null && <div><span className="text-[10px] opacity-70">Battery</span><div className="font-medium">🔋 {item.battery_level}% {item.is_charging ? '⚡' : ''}</div></div>}
                      <div><span className="text-[10px] opacity-70">Deliveries</span><div className="font-medium">{item.total_deliveries || 0} ✓ / {item.failed_deliveries || 0} ✗</div></div>
                      <div><span className="text-[10px] opacity-70">Last Ping</span><div className="font-medium">{item.last_ping_at ? `${formatDate(item.last_ping_at)} ${formatTime(item.last_ping_at)}` : 'Never'}</div></div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => toggleDevice(item.id, item.is_active)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${item.is_active ? 'bg-white/20 text-white' : 'bg-white/30 text-white'}`}>
                        <Power className="w-3 h-3" /> {item.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button onClick={() => setEditDevice(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white">
                        <Edit className="w-3 h-3" /> {isSo ? 'Wax ka Badal' : 'Edit'}
                      </button>
                      <button onClick={() => setDeleteDevice(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/30 text-white">
                        <Trash2 className="w-3 h-3" /> {isSo ? 'Tir' : 'Delete'}
                      </button>
                    </div>
                    <div className="text-[10px] opacity-50 font-mono truncate">ID: {item.device_id}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      {editDevice && (
        <EditDeviceDialog
          open={!!editDevice}
          onOpenChange={(open) => { if (!open) setEditDevice(null); }}
          device={editDevice}
          onSuccess={() => { setEditDevice(null); loadDevices(); }}
        />
      )}

      {/* Delete Dialog */}
      {deleteDevice && (
        <DeleteDeviceDialog
          open={!!deleteDevice}
          onOpenChange={(open) => { if (!open) setDeleteDevice(null); }}
          device={deleteDevice}
          onSuccess={() => { setDeleteDevice(null); loadDevices(); }}
        />
      )}
    </div>
  );
};

// ========== BLOCKED USERS ==========
export const BlockedCustomView = ({ isSo }: { isSo: boolean }) => {
  const [blocked, setBlocked] = useState<any[]>([]);
  const [blockedPayments, setBlockedPayments] = useState<Record<string, { total: number; count: number }>>({});
  const [blockedOrders, setBlockedOrders] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [newReason, setNewReason] = useState('');
  const [alertOrder, setAlertOrder] = useState<{ phone: string; order: any } | null>(null);
  const blockedRef = useRef<any[]>([]);

  const getPhoneVariants = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const vars = [digits];
    if (digits.startsWith('252')) vars.push(digits.slice(3));
    else vars.push('252' + digits);
    return vars;
  };

  const matchesPhone = (testPhone: string, originalPhone: string) => {
    const t = (testPhone || '').replace(/\D/g, '');
    return getPhoneVariants(originalPhone).includes(t);
  };

  const loadBlocked = useCallback(async () => {
    const { data } = await supabase.from('blocked_users').select('*').eq('is_active', true).order('created_at', { ascending: false });
    const blockedList = data || [];
    setBlocked(blockedList);
    blockedRef.current = blockedList;

    if (blockedList.length > 0) {
      const phones = blockedList.map((b: any) => b.phone_number);
      const allPhoneVariants = phones.flatMap((p: string) => getPhoneVariants(p));

      const [receiptsRes, ordersRes] = await Promise.all([
        supabase.from('payment_receipts').select('sender_phone, amount').in('sender_phone', allPhoneVariants),
        supabase.from('orders').select('id, customer_phone, sender_phone, receiver_phone, package_name, selling_price, status, delivery_status, created_at, data_amount').or(
          `customer_phone.in.(${allPhoneVariants.join(',')}),sender_phone.in.(${allPhoneVariants.join(',')})`
        ).order('created_at', { ascending: false }),
      ]);

      const paymentMap: Record<string, { total: number; count: number }> = {};
      (receiptsRes.data || []).forEach((r: any) => {
        for (const bp of phones) {
          if (matchesPhone(r.sender_phone, bp)) {
            paymentMap[bp] = paymentMap[bp] || { total: 0, count: 0 };
            paymentMap[bp].total += r.amount;
            paymentMap[bp].count += 1;
          }
        }
      });
      setBlockedPayments(paymentMap);

      const orderMap: Record<string, any[]> = {};
      (ordersRes.data || []).forEach((o: any) => {
        for (const bp of phones) {
          if (matchesPhone(o.customer_phone, bp) || matchesPhone(o.sender_phone, bp)) {
            orderMap[bp] = orderMap[bp] || [];
            orderMap[bp].push(o);
          }
        }
      });
      setBlockedOrders(orderMap);
    }

    setLoading(false);
  }, []);

  useEffect(() => { loadBlocked(); }, [loadBlocked]);
  useRealtimeRefresh(['blocked_users'], loadBlocked, 800, { notify: true, lang: isSo ? 'so' : 'en' });

  // Listen for new orders from blocked users
  useEffect(() => {
    const channel = supabase.channel('blocked-orders-alert')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload: any) => {
        const order = payload.new;
        const currentBlocked = blockedRef.current;
        for (const b of currentBlocked) {
          if (matchesPhone(order.customer_phone || '', b.phone_number) || matchesPhone(order.sender_phone || '', b.phone_number)) {
            // Alert! Blocked user placed an order
            setAlertOrder({ phone: b.phone_number, order });
            setExpandedId(b.id);
            // Re-fetch to update orders list
            loadBlocked();
            // Play alert sound
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZaXl5aTjoeAeXRxcHR5gIiPlpmcnJuYk42HgHlybnBzdnyEi5KXmpycm5iSjIV+d3Fuc3d8g4qRlpqcnJuYk42Gf3hybXJ3fISLkpibnZ2cm5iSjIV+d3FuaW1yd4CIkJebnp+fnZqVj4l/d3BrZ2twdoGJkpicn6CfnZqVkImBeHBqZmtwd4KKk5mdn6GgnpuWkYqBeHBqZWludoGKk5mdoKGhn5yXkYqBeXFqZWpudoGKkpmeoKGhn5yXkYqBeXBqZGpud4KLk5qeoaKhoJ2YkouCeXFqZGludoKLk5qeoaKhoJ2YkouCeXBpZGlud4KLlJqfoaKioJ2Yk4uCeXBpY2lud4KMlJufoaOioJ6Zk4uCeXBpY2lud4KMlJufoaOioJ6ZlIuDeXBpY2lueIKMlJugoaOioJ6ZlIuDeXFpY2lueIOMlZugoaOioZ+ZlIyDenFpY2lueIONlZygoaOioZ+ZlIyDenFqZGlueIONlZygoaSioZ+alIyDenFqZGpveIONlZygoaSioZ+alIyEenFqZGpveIONlp2hoaSioZ+alY2EenFqZGpveYSNlp2hoaSjop+alY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpveYSNlp2hoaSjop+blY2EenJqZGpv');
              audio.volume = 0.8;
              audio.play().catch(() => {});
            } catch {}
            toast.error(
              isSo
                ? `⚠️ DIGNIIN! Qof la xiray (${b.phone_number}) ayaa dalab cusub sameeyay!`
                : `⚠️ ALERT! Blocked user (${b.phone_number}) placed a new order!`,
              { duration: 10000 }
            );
            break;
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadBlocked]);

  const unblockUser = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa?' : 'Unblock this user?')) return;
    await supabase.from('blocked_users').update({ is_active: false, unblocked_at: new Date().toISOString() }).eq('id', id);
    setBlocked(prev => prev.filter(b => b.id !== id));
    toast.success(isSo ? 'Waa la furay' : 'Unblocked');
  };

  const blockUser = async () => {
    if (!newPhone.trim()) return;
    const { data, error } = await supabase.from('blocked_users').insert({ phone_number: newPhone.trim(), reason: newReason.trim() || null, is_active: true }).select().single();
    if (error) { toast.error('Error'); return; }
    setBlocked(prev => [data, ...prev]);
    setNewPhone(''); setNewReason('');
    toast.success(isSo ? 'Waa la xiray' : 'User blocked');
  };

  const getStatusColor = (status: string) => {
    if (status === 'delivered') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (status === 'failed' || status === 'cancelled') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
  };

  return (
    <div className="space-y-3">
      {/* Alert banner for blocked user order */}
      {alertOrder && (
        <div className="bg-red-600 text-white rounded-xl p-3 shadow-lg animate-pulse">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚨</span>
              <div>
                <div className="text-sm font-bold">{isSo ? 'DIGNIIN! Qof la xiray ayaa dalab sameeyay!' : 'ALERT! Blocked user placed an order!'}</div>
                <div className="text-xs opacity-90">{formatPhone(alertOrder.phone)} → {alertOrder.order.package_name} (${alertOrder.order.selling_price?.toFixed(2)})</div>
              </div>
            </div>
            <button onClick={() => setAlertOrder(null)} className="text-white/80 hover:text-white text-lg font-bold px-2">✕</button>
          </div>
        </div>
      )}
      <StatCardsRow cards={[
        { label: isSo ? 'La xiray' : 'Blocked', value: blocked.length, icon: Ban, color: 'bg-red-500' },
      ]} />
      <div className="bg-white dark:bg-gray-800 rounded-xl border p-3 space-y-2">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-200">➕ {isSo ? 'User Cusub Block' : 'Block New User'}</div>
        <input type="tel" inputMode="numeric" pattern="[0-9]*" value={newPhone} onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))} placeholder={isSo ? 'Lambarka...' : 'Phone number...'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
        <input value={newReason} onChange={e => setNewReason(e.target.value)} placeholder={isSo ? 'Sababta...' : 'Reason (optional)...'} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none" />
        <button onClick={blockUser} className="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-medium active:bg-red-600">
          <Ban className="w-3.5 h-3.5 inline mr-1" /> {isSo ? 'Xir' : 'Block'}
        </button>
      </div>
      {loading ? <LazyFallback /> : blocked.length === 0 ? <EmptyState message={isSo ? 'Wax la xirin' : 'No blocked users'} /> : (
        <div className="space-y-2">
          {blocked.map((item) => {
            const isExpanded = expandedId === item.id;
            const orders = blockedOrders[item.phone_number] || [];
            const payments = blockedPayments[item.phone_number];
            return (
              <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-red-100 dark:border-red-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : item.id)} className="w-full px-3 py-2.5 flex items-center justify-between text-left">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Ban className="w-4 h-4 text-red-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">{formatPhone(item.phone_number)}</div>
                      <div className="text-[11px] text-gray-400">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {orders.length > 0 && (
                      <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold">{orders.length} {isSo ? 'dalab' : 'orders'}</span>
                    )}
                    <span className="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">Blocked</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <InvoiceAccordionContent isSo={isSo} id={item.id} rows={[
                      { icon: Phone, label: isSo ? 'Lambarka' : 'Phone', value: item.phone_number, color: 'text-red-500' },
                      { icon: DollarSign, label: isSo ? 'Lacag soo diray' : 'Total Sent', value: payments ? `$${payments.total.toFixed(2)} (${payments.count} ${isSo ? 'lacag' : 'payments'})` : (isSo ? 'Wax lacag ah ma jirto' : 'No payments'), color: 'text-emerald-500' },
                      { icon: Package, label: isSo ? 'Dalabyada' : 'Orders', value: `${orders.length}`, color: 'text-blue-500' },
                      { icon: Calendar, label: isSo ? 'La xiray' : 'Blocked', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-gray-500' },
                    ]} notes={item.reason} actions={<ActionBtn onClick={() => unblockUser(item.id)} icon={CheckCircle} label={isSo ? 'Fur' : 'Unblock'} variant="success" />} />

                    {orders.length > 0 && (
                      <div className="px-3 pb-3">
                        <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-1">
                          <Package className="w-3.5 h-3.5" />
                          {isSo ? 'Dalabyada uu sameeyay' : 'Orders placed'}
                        </div>
                        <div className="space-y-1.5 max-h-60 overflow-y-auto">
                          {orders.map((order: any) => (
                            <div key={order.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-800 dark:text-white truncate">{order.package_name}</div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                  <span>{formatPhone(order.receiver_phone)}</span>
                                  <span>•</span>
                                  <span>{formatDate(order.created_at)}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-2 shrink-0">
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">${order.selling_price?.toFixed(2)}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${getStatusColor(order.status)}`}>
                                  {order.status === 'delivered' ? '✓' : order.status === 'failed' || order.status === 'cancelled' ? '✗' : '⏳'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};