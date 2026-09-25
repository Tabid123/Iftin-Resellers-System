import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ChevronLeft, ChevronRight, ChevronDown, Phone, DollarSign, Hash, Clock } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTenant } from '@/contexts/TenantContext';
import { calculateEvoucherProfit, calculateOrderProfit, effectiveOrderCost, isDirectFlowCode } from '@/lib/iftinProfit';

interface Transaction {
  id: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status?: string | null;
  created_at: string;
  package_id: string;
  provider_id: string;
  cost_price: number;
  evoucher_rate: number;
  sender_phone?: string | null;
  receiver_phone?: string | null;
  provider_name: string;
  is_direct_flow: boolean;
  bundle_profit?: number | null;
}

interface Provider {
  id: string;
  provider_name: string;
  evoucher_rate: number | null;
}

interface PackageConfig {
  id: string;
  provider_id: string;
  category_id: string | null;
  ussd_code: string | null;
  is_discovery_root: boolean | null;
  selling_price: number;
  cost_price: number;
}

interface DeliveryInstruction {
  package_id: string | null;
  category_id: string | null;
  provider_id: string | null;
  code_template: string | null;
}

const PAGE_SIZE = 50;

// *870*, *866*, *101* and *212* are cash-cost menu flows.
// Their business profit is always Selling - Cost; E-Voucher rate must not be added.
const calculateRowProfit = (row: Transaction): number =>
  row.bundle_profit != null
    ? Number(row.bundle_profit)
    : calculateOrderProfit(row.selling_price, row.cost_price, row.evoucher_rate, row.is_direct_flow);

const calculateRowEvProfit = (row: Transaction): number =>
  row.bundle_profit != null
    ? Number(row.bundle_profit)
    : row.is_direct_flow
      ? Number(row.selling_price || 0) - Number(row.cost_price || 0)
      : calculateEvoucherProfit(row.selling_price, row.cost_price, row.evoucher_rate);

const isDelivered = (row: Transaction) =>
  row.delivery_status === 'delivered' || (!row.delivery_status && row.status === 'completed');

const formatPhone = (phone?: string | null) => {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '').replace(/^252/, '');
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  return clean;
};

const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const getPeriodRange = (period: string): { start?: string; end?: string } => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  switch (period) {
    case 'today':
      return { start: today.toISOString() };
    case 'yesterday': {
      const start = new Date(today);
      start.setDate(start.getDate() - 1);
      return { start: start.toISOString(), end: today.toISOString() };
    }
    case 'week': {
      const start = new Date(today);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      return { start: start.toISOString() };
    }
    case 'month': {
      const start = new Date(today);
      start.setDate(1);
      return { start: start.toISOString() };
    }
    case 'year': {
      const start = new Date(today);
      start.setMonth(0, 1);
      return { start: start.toISOString() };
    }
    default:
      return {};
  }
};

const instructionMatchesPackage = (instruction: DeliveryInstruction, pkg: PackageConfig) => {
  if (!isDirectFlowCode(instruction.code_template)) return false;
  if (instruction.package_id) return instruction.package_id === pkg.id;
  if (instruction.category_id) return instruction.category_id === pkg.category_id;
  if (instruction.provider_id) return instruction.provider_id === pkg.provider_id;
  return false;
};

export function TransactionsDashboard() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const tenantState = useTenant();
  const tenantId = tenantState.status === 'ready' ? tenantState.tenant?.id ?? null : null;

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [serverStats, setServerStats] = useState({ revenue: 0, cost: 0, profitEvoucher: 0, profitUsd: 0, deliveredCount: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('today');
  const [providerFilter, setProviderFilter] = useState('all');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const loadData = useCallback(async () => {
    if (!tenantId) {
      setTransactions([]);
      setProviders([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { start, end } = getPeriodRange(periodFilter);

    let orderQuery = supabase
      .from('orders')
      .select('id, customer_phone, sender_phone, receiver_phone, package_name, package_id, data_amount, selling_price, cost_price, status, delivery_status, created_at, provider_id, tenant_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE - 1);

    if (providerFilter !== 'all') orderQuery = orderQuery.eq('provider_id', providerFilter);
    if (start) orderQuery = orderQuery.gte('created_at', start);
    if (end) orderQuery = orderQuery.lt('created_at', end);
    if (debouncedSearch) {
      const q = debouncedSearch.replace(/[%(),]/g, '').trim();
      if (q) {
        orderQuery = orderQuery.or(`customer_phone.ilike.%${q}%,receiver_phone.ilike.%${q}%,sender_phone.ilike.%${q}%,package_name.ilike.%${q}%,id.ilike.${q}%`);
      }
    }
    if (statusFilter === 'completed') orderQuery = orderQuery.eq('delivery_status', 'delivered');
    else if (statusFilter === 'failed') orderQuery = orderQuery.or('delivery_status.eq.failed,delivery_status.eq.timeout,status.eq.failed');
    else if (statusFilter === 'pending') orderQuery = orderQuery.not('delivery_status', 'in', '(delivered,failed,timeout)').neq('status', 'failed');

    const [ordersResult, providersResult, packagesResult, instructionsResult, bundleRulesResult, summaryResult] = await Promise.all([
      orderQuery,
      supabase
        .from('providers_config')
        .select('id, provider_name, evoucher_rate')
        .eq('tenant_id', tenantId)
        .order('display_order'),
      supabase
        .from('data_packages_config')
        .select('id, provider_id, category_id, ussd_code, is_discovery_root, selling_price, cost_price')
        .eq('tenant_id', tenantId),
      supabase
        .from('delivery_instructions')
        .select('package_id, category_id, provider_id, code_template')
        .eq('tenant_id', tenantId),
      supabase
        .from('package_delivery_rules')
        .select('source_package_id, target_package_id, delivery_count, is_active')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      (supabase as any).rpc('get_admin_transactions_summary', {
        p_start: start ?? null,
        p_end: end ?? null,
        p_provider_id: providerFilter === 'all' ? null : providerFilter,
      }),
    ]);

    const firstError = ordersResult.error || providersResult.error || packagesResult.error || instructionsResult.error || bundleRulesResult.error || summaryResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setTotalRows(ordersResult.count ?? 0);
    const summary = summaryResult.data || {};
    setServerStats({
      revenue: Number(summary.revenue || 0),
      cost: Number(summary.cost || 0),
      profitEvoucher: Number(summary.profit_evoucher || 0),
      profitUsd: Number(summary.profit_usd || 0),
      deliveredCount: Number(summary.delivered_count || 0),
    });

    const providerRows = (providersResult.data || []) as Provider[];
    const providerMap = new Map(providerRows.map((provider) => [provider.id, provider]));
    const packageRows = (packagesResult.data || []) as PackageConfig[];
    const packageMap = new Map(packageRows.map((pkg) => [pkg.id, pkg]));
    const instructions = (instructionsResult.data || []) as DeliveryInstruction[];

    const bundleProfitBySource = new Map<string, number>();
    for (const rule of (bundleRulesResult.data || []) as any[]) {
      const target = packageMap.get(rule.target_package_id);
      if (!target) continue;
      const count = Math.max(1, Number(rule.delivery_count || 1));
      const perDeliveryProfit = Number(target.selling_price || 0) - Number(target.cost_price || 0);
      bundleProfitBySource.set(
        rule.source_package_id,
        (bundleProfitBySource.get(rule.source_package_id) || 0) + (perDeliveryProfit * count),
      );
    }

    const decorated = (ordersResult.data || []).map((order: any) => {
      const provider = providerMap.get(order.provider_id);
      const pkg = packageMap.get(order.package_id);
      const isDirectFlow = Boolean(
        pkg && (
          pkg.is_discovery_root ||
          isDirectFlowCode(pkg.ussd_code) ||
          instructions.some((instruction) => instructionMatchesPackage(instruction, pkg))
        )
      );

      return {
        ...order,
        selling_price: Number(order.selling_price || 0),
        cost_price: effectiveOrderCost(order.cost_price, pkg?.cost_price),
        evoucher_rate: Number(provider?.evoucher_rate || 0),
        provider_name: provider?.provider_name || '—',
        is_direct_flow: isDirectFlow,
        bundle_profit: bundleProfitBySource.has(order.package_id)
          ? bundleProfitBySource.get(order.package_id)!
          : null,
      } as Transaction;
    });

    setProviders(providerRows);
    setTransactions(decorated);
    setLoading(false);
  }, [tenantId, periodFilter, providerFilter, currentPage, debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`transactions-profit:${tenantId}:${Date.now()}:${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
        () => void loadData(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tenantId, loadData]);

  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearch, statusFilter, providerFilter, periodFilter]);

  const filteredTransactions = transactions;

  const stats = serverStats;

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pageRows = filteredTransactions;

  const getStatusColor = (row: Transaction) => {
    if (isDelivered(row)) return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    const status = row.delivery_status || row.status;
    if (status === 'failed') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    if (status === 'timeout') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
  };

  if (!tenantId && tenantState.status !== 'loading') {
    return <div className="py-12 text-center text-sm text-gray-500">Tenant lama helin.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="bg-blue-500 text-white border-0 shadow-md"><CardContent className="p-2.5"><p className="text-[9px] text-blue-100 font-medium">Delivered</p><p className="text-lg font-bold">{stats.deliveredCount}</p></CardContent></Card>
        <Card className="bg-purple-600 text-white border-0 shadow-md"><CardContent className="p-2.5"><p className="text-[9px] text-purple-100 font-medium">Sales / Revenue</p><p className="text-lg font-bold">${stats.revenue.toFixed(2)}</p><p className="text-[8px] text-purple-200">Selling price only</p></CardContent></Card>
        <Card className="bg-emerald-600 text-white border-0 shadow-md"><CardContent className="p-2.5"><p className="text-[9px] text-emerald-100 font-medium">USD Profit</p><p className="text-lg font-bold">${stats.profitUsd.toFixed(2)}</p><p className="text-[8px] text-emerald-200">Flows: Selling − Cost</p></CardContent></Card>
        <Card className="bg-gray-700 text-white border-0 shadow-md"><CardContent className="p-2.5"><p className="text-[9px] text-gray-200 font-medium">EV / Flow Profit</p><p className="text-lg font-bold">${stats.profitEvoucher.toFixed(2)}</p><p className="text-[8px] text-gray-300">Cost: ${stats.cost.toFixed(2)}</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <Input placeholder={isSo ? 'Raadi Phone/ID...' : 'Search Phone/ID...'} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="h-9 bg-white pl-9 text-sm dark:bg-gray-800" />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-8 min-w-[100px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="completed">Delivered</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="failed">Failed</SelectItem></SelectContent></Select>
        <Select value={providerFilter} onValueChange={setProviderFilter}><SelectTrigger className="h-8 min-w-[120px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Providers</SelectItem>{providers.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.provider_name}</SelectItem>)}</SelectContent></Select>
        <Select value={periodFilter} onValueChange={setPeriodFilter}><SelectTrigger className="h-8 min-w-[105px] text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">Today</SelectItem><SelectItem value="yesterday">Yesterday</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="year">This Year</SelectItem><SelectItem value="all">All Time</SelectItem></SelectContent></Select>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
      ) : pageRows.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">{isSo ? 'Wax transaction ah lama helin' : 'No transactions found'}</div>
      ) : (
        <div className="space-y-2">
          {pageRows.map((row) => {
            const expanded = expandedId === row.id;
            const profitUsd = calculateRowProfit(row);
            const profitEv = calculateRowEvProfit(row);
            const displayStatus = isDelivered(row) ? 'delivered' : (row.delivery_status || row.status);

            return (
              <div key={row.id} className="overflow-hidden rounded-lg border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <button type="button" onClick={() => setExpandedId(expanded ? null : row.id)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-bold text-gray-800 dark:text-white">{row.package_name}</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${getStatusColor(row)}`}>{displayStatus}</span></div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500"><span>{row.provider_name}</span><span>•</span><span>{formatTime(row.created_at)}</span></div>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-sm font-bold text-gray-800 dark:text-white">${row.selling_price.toFixed(2)}</p><p className={`text-[10px] font-semibold ${profitUsd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Profit ${profitUsd.toFixed(3)}</p></div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded && (
                  <div className="grid grid-cols-2 gap-2 border-t bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/40">
                    <div><Phone className="mr-1 inline h-3 w-3" />Receiver: {formatPhone(row.receiver_phone || row.customer_phone)}</div>
                    <div><Clock className="mr-1 inline h-3 w-3" />{formatDate(row.created_at)} {formatTime(row.created_at)}</div>
                    <div><DollarSign className="mr-1 inline h-3 w-3" />Selling: ${row.selling_price.toFixed(2)}</div>
                    <div><DollarSign className="mr-1 inline h-3 w-3" />Cost: ${row.cost_price.toFixed(2)}</div>
                    <div><DollarSign className="mr-1 inline h-3 w-3" />USD Profit: ${profitUsd.toFixed(4)}</div>
                    <div><DollarSign className="mr-1 inline h-3 w-3" />{row.bundle_profit != null ? 'Bundle Profit' : row.is_direct_flow ? 'Flow Profit' : 'EV Profit'}: ${profitEv.toFixed(4)}</div>
                    <div><Hash className="mr-1 inline h-3 w-3" />{row.bundle_profit != null ? 'Bundle: Σ(Target Sell − Target Cost) × Count' : row.is_direct_flow ? 'Flow: Selling − Cost' : `Rate: ${(row.evoucher_rate * 100).toFixed(2)}%`}</div>
                    <div className="truncate font-mono">ID: {row.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button type="button" disabled={currentPage === 0} onClick={() => setCurrentPage((page) => Math.max(0, page - 1))} className="rounded-lg border p-2 disabled:opacity-30 dark:border-gray-700"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xs text-gray-500">{currentPage + 1} / {totalPages}</span>
          <button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage((page) => Math.min(totalPages - 1, page + 1))} className="rounded-lg border p-2 disabled:opacity-30 dark:border-gray-700"><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
