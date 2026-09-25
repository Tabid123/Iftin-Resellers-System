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
import { deleteTenantOfflineRegistration, saveTenantOfflineRegistration } from '@/lib/tenantOfflineRegistration';
import { EditDeviceDialog } from '../EditDeviceDialog';
import { DeleteDeviceDialog } from '../DeleteDeviceDialog';
import { AdminPagination, ADMIN_PAGE_SIZE } from './AdminPagination';

// ========== CUSTOMERS ==========
export const CustomersCustomView = ({ isSo }: { isSo: boolean }) => {
  const [phones, setPhones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState({ total: 0, new_today: 0, bought_today: 0, inactive: 0 });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debouncedSearch]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_customers_page', {
      p_limit: ADMIN_PAGE_SIZE,
      p_offset: page * ADMIN_PAGE_SIZE,
      p_search: debouncedSearch || null,
    });
    if (error) {
      console.error('[Customers] load failed', error);
      setPhones([]);
      setLoading(false);
      return;
    }
    const payload = (data || {}) as any;
    setPhones(Array.isArray(payload.rows) ? payload.rows : []);
    setSummary({
      total: Number(payload.total || 0),
      new_today: Number(payload.new_today || 0),
      bought_today: Number(payload.bought_today || 0),
      inactive: Number(payload.inactive || 0),
    });
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => { void loadData(); }, [loadData]);
  useRealtimeRefresh(['verified_phones', 'orders', 'offline_registrations'], loadData, 1200, { notify: true, lang: isSo ? 'so' : 'en' });

  const deleteCustomer = async (id: string | null, phone: string) => {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error(isSo ? 'Macmiilkan lama tirtiri karo' : 'This customer cannot be deleted');
      return;
    }
    if (!confirm(isSo ? `Ma hubtaa inaad tirtirto ${phone}?` : `Delete ${phone}?`)) return;
    const { error } = await supabase.from('verified_phones').delete().eq('id', id);
    if (error) { toast.error('Error'); return; }
    toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
    await loadData();
  };

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: isSo ? 'Wadarta' : 'Total', value: summary.total, color: 'bg-purple-500', icon: Users },
        { label: isSo ? 'Cusub Maanta' : 'New Today', value: summary.new_today, color: 'bg-green-500', icon: UserPlus },
        { label: isSo ? 'Maanta libsatay' : 'Bought Today', value: summary.bought_today, color: 'bg-blue-500', icon: Package },
        { label: isSo ? 'Aan libsan' : 'Never Bought', value: summary.inactive, color: 'bg-orange-500', icon: XCircle },
      ]} />
      <SearchInput value={search} onChange={setSearch} placeholder={isSo ? 'Raadi lambarka...' : 'Search phone...'} />
      {loading ? <LazyFallback /> : phones.length === 0 ? (
        <EmptyState message={isSo ? 'Wax macaamiil ah lama helin' : 'No customers found'} />
      ) : (
        <div className="space-y-2">
          {phones.map((item, idx) => {
            const isExpanded = expandedId === (item.id || item.phone_number);
            const key = item.id || item.phone_number;
            const hasOrders = Number(item.order_count || 0) > 0;
            return (
              <div key={key} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-100/50 dark:border-purple-900/20 overflow-hidden">
                <button onClick={() => setExpandedId(isExpanded ? null : key)} className="w-full px-3 py-2.5 flex items-center justify-between text-left active:bg-purple-50/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-purple-400 w-5">#{page * ADMIN_PAGE_SIZE + idx + 1}</span>
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Phone className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-800 dark:text-white">+252{formatPhone(item.phone_number)}</div>
                      <div className="text-[11px] text-gray-400">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.bought_today && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">{isSo ? 'Maanta' : 'Today'}</span>}
                    {hasOrders ? <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">Active</span> : <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">Inactive</span>}
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {isExpanded && (
                  <InvoiceAccordionContent isSo={isSo} id={key} rows={[
                    { icon: Phone, label: isSo ? 'Lambarka' : 'Phone', value: `+252${item.phone_number}`, color: 'text-purple-500' },
                    { icon: Calendar, label: isSo ? 'Diiwaangelintu' : 'Registered', value: `${formatDate(item.created_at)} ${formatTime(item.created_at)}`, color: 'text-teal-500' },
                    ...(item.last_login_at ? [{ icon: Calendar, label: isSo ? 'Gelitiin Danbe' : 'Last Login', value: `${formatDate(item.last_login_at)} ${formatTime(item.last_login_at)}`, color: 'text-blue-500' }] : []),
                    { icon: Package, label: isSo ? 'Dalabyada' : 'Orders', value: String(item.order_count || 0), color: 'text-cyan-500' },
                    { icon: DollarSign, label: isSo ? 'Ku bixiyay' : 'Total Spent', value: `$${Number(item.total_spent || 0).toFixed(2)}`, color: 'text-emerald-500' },
                  ]} actions={item.id ? <ActionBtn onClick={() => void deleteCustomer(item.id, item.phone_number)} icon={Trash2} label={isSo ? 'Tirtir' : 'Delete'} variant="danger" /> : undefined} />
                )}
              </div>
            );
          })}
        </div>
      )}
      <AdminPagination page={page} total={summary.total} pageSize={ADMIN_PAGE_SIZE} onPageChange={setPage} isSo={isSo} />
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
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, today: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [newReg, setNewReg] = useState({ sender_phone: '', receiver_phone: '', provider_id: '', category_id: '', package_id: '' });
  const [providerList, setProviderList] = useState<any[]>([]);
  const [categoryList, setCategoryList] = useState<any[]>([]);
  const [packageList, setPackageList] = useState<any[]>([]);

  useEffect(() => {
    void Promise.all([
      supabase.from('providers_config').select('id, provider_name, display_order').eq('is_active', true).order('display_order'),
      supabase.from('package_categories').select('id, provider_id, category_name, display_order').eq('is_active', true).order('display_order'),
      supabase.from('data_packages_config').select('id, provider_id, category_id, package_name, selling_price, display_order').eq('is_active', true).order('display_order'),
    ]).then(([providersRes, categoriesRes, packagesRes]) => {
      setProviderList(providersRes.data || []);
      setCategoryList(categoriesRes.data || []);
      setPackageList(packagesRes.data || []);
    });
  }, []);

  // Tenant-native only: fetch one 50-row page; counts use HEAD queries with no row payload.
  const loadRegs = useCallback(async () => {
    setLoading(true);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const from = page * ADMIN_PAGE_SIZE;
    const to = from + ADMIN_PAGE_SIZE - 1;

    let query = supabase
      .from('offline_registrations')
      .select('id,sender_phone,receiver_phone,provider_id,provider_name,package_id,package_name,is_active,created_at,updated_at,tenant_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filter === 'active') query = query.eq('is_active', true);
    else if (filter === 'inactive') query = query.eq('is_active', false);
    else if (filter === 'today') query = query.gte('created_at', startOfToday.toISOString());
    if (search.trim()) query = query.or(`sender_phone.ilike.%${search.trim()}%,receiver_phone.ilike.%${search.trim()}%`);

    const [pageRes, totalRes, activeRes, inactiveRes, todayRes] = await Promise.all([
      query,
      supabase.from('offline_registrations').select('id', { count: 'exact', head: true }),
      supabase.from('offline_registrations').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('offline_registrations').select('id', { count: 'exact', head: true }).eq('is_active', false),
      supabase.from('offline_registrations').select('id', { count: 'exact', head: true }).gte('created_at', startOfToday.toISOString()),
    ]);

    if (pageRes.error) toast.error(isSo ? 'Liiska lama soo dejin' : 'Failed to load');
    setRegs((pageRes.data ?? []).map((r: any) => ({ ...r, __local: true })));
    setTotalRows(pageRes.count ?? 0);
    setStats({
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      inactive: inactiveRes.count ?? 0,
      today: todayRes.count ?? 0,
    });
    setLoading(false);
  }, [filter, isSo, page, search]);

  useEffect(() => { void loadRegs(); }, [loadRegs]);
  useRealtimeRefresh(['offline_registrations'], loadRegs, 800);
  useEffect(() => { setPage(0); }, [filter, search]);

  const toggleStatus = async (id: string, _currentStatus: boolean) => {
    const row = regs.find((r) => r.id === id);
    if (!row) return;
    const { error } = await supabase
      .from('offline_registrations')
      .update({ is_active: !(row.is_active !== false) })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    await loadRegs();
    toast.success(isSo ? 'Waa la cusboonaysiiyay' : 'Status updated');
  };

  const deleteReg = async (id: string) => {
    if (!confirm(isSo ? 'Ma hubtaa inaad tirtirto?' : 'Delete this registration?')) return;
    try {
      await deleteTenantOfflineRegistration(id);
      setRegs(prev => prev.filter(r => r.id !== id));
      toast.success(isSo ? 'Waa la tirtiray' : 'Deleted');
    } catch (error: any) {
      toast.error(error?.message ?? 'Khalad');
    }
  };

  const addReg = async () => {
    if (!newReg.sender_phone || !newReg.receiver_phone) {
      toast.error(isSo ? 'Buuxi meelaha' : 'Fill required fields');
      return;
    }
    if (!newReg.provider_id) {
      toast.error(isSo ? 'Fadlan dooro shirkadda' : 'Please choose a provider');
      return;
    }
    const provider = providerList.find((p) => p.id === newReg.provider_id);
    const pkg = newReg.package_id
      ? packageList.find((p) => p.id === newReg.package_id)
      : null;

    try {
      if (newReg.package_id) {
        await saveTenantOfflineRegistration({
          sender_phone: newReg.sender_phone,
          receiver_phone: newReg.receiver_phone,
          provider_id: newReg.provider_id,
          provider_name: provider?.provider_name ?? null,
          package_id: newReg.package_id,
          package_name: pkg?.package_name ?? null,
        });
      } else {
        const { data: existing, error: existingError } = await supabase
          .from('offline_registrations')
          .select('id')
          .eq('sender_phone', newReg.sender_phone)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existing?.id) {
          const { error } = await supabase
            .from('offline_registrations')
            .update({
              receiver_phone: newReg.receiver_phone,
              provider_id: newReg.provider_id,
              provider_name: provider?.provider_name ?? null,
              package_id: null,
              package_name: null,
              is_active: true,
            })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('offline_registrations')
            .insert({
              sender_phone: newReg.sender_phone,
              receiver_phone: newReg.receiver_phone,
              provider_id: newReg.provider_id,
              provider_name: provider?.provider_name ?? null,
              package_id: null,
              package_name: null,
              is_active: true,
            });
          if (error) throw error;
        }
      }

      setNewReg({ sender_phone: '', receiver_phone: '', provider_id: '', category_id: '', package_id: '' });
      setShowAdd(false);
      await loadRegs();
      toast.success(isSo ? 'Waa lagu daray' : 'Added');
    } catch (error: any) {
      toast.error(error?.message ?? 'Khalad');
    }
  };

  const filteredCategories = categoryList.filter(
    (category) => !newReg.provider_id || String(category.provider_id) === String(newReg.provider_id),
  );
  const filteredPackages = packageList.filter(
    (pkg) =>
      (!newReg.provider_id || String(pkg.provider_id) === String(newReg.provider_id)) &&
      (!newReg.category_id || String(pkg.category_id) === String(newReg.category_id)),
  );

  const filteredRegs = regs;

  return (
    <div className="space-y-3">
      <StatCardsRow cards={[
        { label: 'Total', value: stats.total, color: 'bg-purple-500', icon: Users },
        { label: 'Active', value: stats.active, color: 'bg-green-500', icon: CheckCircle },
        { label: 'Inactive', value: stats.inactive, color: 'bg-amber-500', icon: XCircle },
        { label: isSo ? 'Maanta' : 'Today', value: stats.today, color: 'bg-sky-500', icon: UserPlus },
      ]} />
      <FilterRow filters={[
        { key: 'all', label: isSo ? 'Dhammaan' : 'All', count: stats.total },
        { key: 'active', label: 'Active', count: stats.active },
        { key: 'inactive', label: 'Inactive', count: stats.inactive },
        { key: 'today', label: isSo ? 'Maanta' : 'Today', count: stats.today },
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
            value={newReg.provider_id}
            onChange={e => setNewReg(p => ({ ...p, provider_id: e.target.value, category_id: '', package_id: '' }))}
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none"
          >
            <option value="">{isSo ? 'Dooro shirkadda *' : 'Choose provider *'}</option>
            {providerList.map(p => (
              <option key={p.id} value={p.id}>{p.provider_name}</option>
            ))}
          </select>

          {newReg.provider_id && (
            <>
              <select
                value={newReg.category_id}
                onChange={e => setNewReg(p => ({ ...p, category_id: e.target.value, package_id: '' }))}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none"
              >
                <option value="">{isSo ? 'Category (optional)' : 'Category (optional)'}</option>
                {filteredCategories.map(category => (
                  <option key={category.id} value={category.id}>{category.category_name}</option>
                ))}
              </select>

              <select
                value={newReg.package_id}
                onChange={e => setNewReg(p => ({ ...p, package_id: e.target.value }))}
                disabled={!newReg.category_id}
                className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none disabled:opacity-50"
              >
                <option value="">
                  {newReg.category_id
                    ? (isSo ? 'Package (optional)' : 'Package (optional)')
                    : (isSo ? 'Dooro category haddii aad rabto package gaar ah' : 'Choose a category for a specific package')}
                </option>
                {filteredPackages.map(pkg => (
                  <option key={pkg.id} value={pkg.id}>{pkg.package_name}</option>
                ))}
              </select>
            </>
          )}

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
                    <span className="text-[10px] font-bold text-purple-400 w-5">#{page * ADMIN_PAGE_SIZE + idx + 1}</span>
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
                    { icon: Package, label: isSo ? 'Xirmo' : 'Package', value: item.package_name || '—', color: 'text-orange-500' },
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
      <AdminPagination page={page} total={totalRows} pageSize={ADMIN_PAGE_SIZE} onPageChange={setPage} isSo={isSo} />
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
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  const loadDevices = useCallback(async () => {
    const from = page * ADMIN_PAGE_SIZE;
    const to = from + ADMIN_PAGE_SIZE - 1;
    const devRes = await supabase
      .from('android_devices')
      .select('id,device_id,device_name,provider_name,sim1_provider,sim2_provider,sim_number,sim2_number,last_ping_at,is_active,battery_level,is_charging,is_primary_hormuud_sim,sim1_enabled,sim2_enabled,sim1_priority,sim2_priority,total_deliveries,failed_deliveries', { count: 'exact' })
      .is('archived_at', null)
      .order('last_ping_at', { ascending: false })
      .range(from, to);

    const rows = devRes.data || [];
    const ids = rows.map((d: any) => d.id);
    const balRes = ids.length
      ? await supabase
          .from('sim_balances')
          .select('device_id,sim_slot,balance,balance_type,last_updated')
          .in('device_id', ids)
      : { data: [], error: null };

    if (!devRes.error) {
      setDevices(rows);
      setTotalRows(devRes.count ?? 0);
    }
    if (!balRes.error) setBalances(balRes.data || []);
    setLoading(false);
  }, [page]);
  useEffect(() => {
    void loadDevices();
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void loadDevices();
    };
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [loadDevices]);
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

      <AdminPagination page={page} total={totalRows} pageSize={ADMIN_PAGE_SIZE} onPageChange={setPage} isSo={isSo} />

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