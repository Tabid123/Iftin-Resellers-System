import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, TrendingUp, Package, DollarSign, CheckCircle, Clock, XCircle, CreditCard, MessageSquare, BarChart3 } from "lucide-react";
import { format, subDays, startOfDay, startOfWeek, startOfMonth, startOfYear, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

type PeriodFilter = "today" | "week" | "month" | "year";

interface OrderWithDetails {
  id: string;
  selling_price: number;
  delivery_status: string | null;
  payment_source: string | null;
  created_at: string;
  data_packages_config: { cost_price: number } | null;
  providers_config: { evoucher_rate: number | null } | null;
}

interface SourceStats {
  totalOrders: number;
  revenue: number;
  profit: number;
  delivered: number;
  pending: number;
  failed: number;
  successRate: number;
}

interface BreakdownRow {
  label: string;
  waafipayOrders: number;
  smsOrders: number;
  waafipayRevenue: number;
  smsRevenue: number;
  total: number;
}

const CombinedPaymentAnalytics = () => {
  const { language } = useLanguage();
  const [period, setPeriod] = useState<PeriodFilter>("today");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [waafipayStats, setWaafipayStats] = useState<SourceStats>({ totalOrders: 0, revenue: 0, profit: 0, delivered: 0, pending: 0, failed: 0, successRate: 0 });
  const [smsStats, setSmsStats] = useState<SourceStats>({ totalOrders: 0, revenue: 0, profit: 0, delivered: 0, pending: 0, failed: 0, successRate: 0 });
  const [breakdownData, setBreakdownData] = useState<BreakdownRow[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);

  const periodLabels = {
    today: language === 'so' ? 'Maanta' : 'Today',
    week: language === 'so' ? 'Todobaadkan' : 'This Week',
    month: language === 'so' ? 'Bishaan' : 'This Month',
    year: language === 'so' ? 'Sanadkan' : 'This Year',
  };

  const getDateRange = (p: PeriodFilter) => {
    const now = new Date();
    switch (p) {
      case 'today': return startOfDay(now);
      case 'week': return startOfWeek(now, { weekStartsOn: 1 });
      case 'month': return startOfMonth(now);
      case 'year': return startOfYear(now);
    }
  };

  const calculateStats = (orderList: OrderWithDetails[]): SourceStats => {
    const totalOrders = orderList.length;
    const revenue = orderList.reduce((sum, o) => sum + (o.selling_price || 0), 0);
    
    const profit = orderList.reduce((sum, o) => {
      const costPrice = o.data_packages_config?.cost_price || 0;
      const evoucherRate = o.providers_config?.evoucher_rate || 0;
      // Correct formula: profit = (selling_price × (1 + rate)) - cost_price
      const totalReceived = (o.selling_price || 0) * (1 + evoucherRate);
      return sum + (totalReceived - costPrice);
    }, 0);
    
    const delivered = orderList.filter(o => o.delivery_status === 'delivered').length;
    const pending = orderList.filter(o => o.delivery_status === 'pending' || !o.delivery_status).length;
    const failed = orderList.filter(o => o.delivery_status === 'failed').length;
    const successRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0;
    
    return { totalOrders, revenue, profit, delivered, pending, failed, successRate };
  };

  const generateBreakdown = (filteredOrders: OrderWithDetails[], p: PeriodFilter) => {
    const now = new Date();
    const startDate = getDateRange(p);
    
    let intervals: Date[] = [];
    let formatStr = 'MMM d';
    
    if (p === 'today') {
      intervals = [startOfDay(now)];
      formatStr = 'MMM d';
    } else if (p === 'week') {
      intervals = eachDayOfInterval({ start: startDate, end: now });
      formatStr = 'EEE';
    } else if (p === 'month') {
      intervals = eachDayOfInterval({ start: startDate, end: now });
      formatStr = 'MMM d';
    } else {
      intervals = eachMonthOfInterval({ start: startDate, end: now });
      formatStr = 'MMM yyyy';
    }

    const breakdown: BreakdownRow[] = intervals.map(date => {
      const nextDate = p === 'year' 
        ? new Date(date.getFullYear(), date.getMonth() + 1, 1)
        : new Date(date.getTime() + 24 * 60 * 60 * 1000);
      
      const dayOrders = filteredOrders.filter(o => {
        const orderDate = new Date(o.created_at);
        return orderDate >= date && orderDate < nextDate;
      });
      
      const waafipay = dayOrders.filter(o => o.payment_source === 'ussd_online');
      const sms = dayOrders.filter(o => o.payment_source === 'sms_offline' || !o.payment_source);
      
      const waafipayRevenue = waafipay.reduce((s, o) => s + (o.selling_price || 0), 0);
      const smsRevenue = sms.reduce((s, o) => s + (o.selling_price || 0), 0);
      
      return {
        label: format(date, formatStr),
        waafipayOrders: waafipay.length,
        smsOrders: sms.length,
        waafipayRevenue,
        smsRevenue,
        total: waafipayRevenue + smsRevenue
      };
    });
    
    return breakdown.filter(b => b.waafipayOrders > 0 || b.smsOrders > 0);
  };

  const loadData = async () => {
    setLoading(true);
    const startDate = getDateRange(period);
    
    const { fetchAllRows } = await import('@/utils/fetchAllRows');
    const data = await fetchAllRows(() =>
      supabase
        .from('orders')
        .select(`
          id, selling_price, delivery_status, payment_source, created_at,
          data_packages_config(cost_price),
          providers_config(evoucher_rate)
        `)
        .neq('status', 'pending_payment')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
    );

    if (data) {
      const typedData = data as unknown as OrderWithDetails[];
      setOrders(typedData);
      
      const waafipayOrders = typedData.filter(o => o.payment_source === 'ussd_online');
      const smsOrders = typedData.filter(o => o.payment_source === 'sms_offline' || !o.payment_source);
      
      setWaafipayStats(calculateStats(waafipayOrders));
      setSmsStats(calculateStats(smsOrders));
      
      const breakdown = generateBreakdown(typedData, period);
      setBreakdownData(breakdown);
      
      setChartData(breakdown.map(b => ({
        name: b.label,
        Online: b.waafipayOrders,
        SMS: b.smsOrders
      })));
      
      setPieData([
        { name: 'Online (USSD)', value: waafipayOrders.length, color: '#3b82f6' },
        { name: 'SMS Offline', value: smsOrders.length, color: '#22c55e' }
      ].filter(p => p.value > 0));
    }
    
    setLoading(false);
  };

  const recalcAll = (updated: OrderWithDetails[]) => {
    const waafipayOrders = updated.filter(o => o.payment_source === 'ussd_online');
    const smsOrders = updated.filter(o => o.payment_source === 'sms_offline' || !o.payment_source);
    setWaafipayStats(calculateStats(waafipayOrders));
    setSmsStats(calculateStats(smsOrders));
    const breakdown = generateBreakdown(updated, period);
    setBreakdownData(breakdown);
      setChartData(breakdown.map(b => ({ name: b.label, Online: b.waafipayOrders, SMS: b.smsOrders })));
    setPieData([
      { name: 'Online (USSD)', value: waafipayOrders.length, color: '#3b82f6' },
      { name: 'SMS Offline', value: smsOrders.length, color: '#22c55e' }
    ].filter(p => p.value > 0));
  };

  useEffect(() => {
    loadData();
    
    const channel = supabase
      .channel('combined-analytics-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        const newId = payload.new?.id;
        if (!newId) return;
        const { data } = await supabase
          .from('orders')
          .select(`
            id, selling_price, delivery_status, payment_source, created_at,
            data_packages_config(cost_price),
            providers_config(evoucher_rate)
          `)
          .eq('id', newId)
          .neq('status', 'pending_payment')
          .single();
        if (data) {
          const typedRow = data as unknown as OrderWithDetails;
          const startDate = getDateRange(period);
          if (new Date(typedRow.created_at) >= startDate) {
            setOrders(prev => {
              const updated = [typedRow, ...prev];
              recalcAll(updated);
              return updated;
            });
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, async (payload) => {
        const updatedId = payload.new?.id;
        if (!updatedId) return;
        const { data } = await supabase
          .from('orders')
          .select(`
            id, selling_price, delivery_status, payment_source, created_at,
            data_packages_config(cost_price),
            providers_config(evoucher_rate)
          `)
          .eq('id', updatedId)
          .single();
        if (data) {
          const typedRow = data as unknown as OrderWithDetails;
          setOrders(prev => {
            const updated = prev.map(o => o.id === updatedId ? typedRow : o);
            recalcAll(updated);
            return updated;
          });
        }
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [period]);

  const combinedStats = {
    totalOrders: waafipayStats.totalOrders + smsStats.totalOrders,
    revenue: waafipayStats.revenue + smsStats.revenue,
    profit: waafipayStats.profit + smsStats.profit,
    successRate: orders.length > 0 ? ((waafipayStats.delivered + smsStats.delivered) / orders.length) * 100 : 0
  };

  const StatCard = ({ title, stats, icon: Icon, color }: { title: string; stats: SourceStats; icon: any; color: string }) => (
    <Card className={`border-l-4 ${color}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{language === 'so' ? 'Dalabyo' : 'Orders'}:</span>
            <span className="font-bold">{stats.totalOrders}</span>
          </div>
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{language === 'so' ? 'Dakhli' : 'Revenue'}:</span>
            <span className="font-bold text-green-600">${stats.revenue.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{language === 'so' ? "Faa'iido" : 'Profit'}:</span>
            <span className="font-bold text-blue-600">${stats.profit.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">{language === 'so' ? 'Guul' : 'Success'}:</span>
            <span className="font-bold">{stats.successRate.toFixed(1)}%</span>
          </div>
        </div>
        <div className="flex gap-4 pt-2 border-t">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{stats.delivered}</span>
          </div>
          <div className="flex items-center gap-1 text-yellow-600">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">{stats.pending}</span>
          </div>
          <div className="flex items-center gap-1 text-red-600">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{stats.failed}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">
            {language === 'so' ? '📊 Falanqaynta Lacagaha' : '📊 Combined Payment Analytics'}
          </h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(periodLabels) as PeriodFilter[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {periodLabels[p]}
            </Button>
          ))}
        </div>
      </div>

      {/* Side by Side Stats */}
      <div className="grid md:grid-cols-2 gap-4">
        <StatCard 
          title={language === 'so' ? '💳 Online (USSD)' : '💳 Online (USSD)'} 
          stats={waafipayStats} 
          icon={CreditCard} 
          color="border-l-blue-500" 
        />
        <StatCard 
          title={language === 'so' ? '📲 SMS Offline' : '📲 SMS Offline'} 
          stats={smsStats} 
          icon={MessageSquare} 
          color="border-l-green-500" 
        />
      </div>

      {/* Combined Totals */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-center gap-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">{language === 'so' ? 'Wadarta Dalabyo' : 'Total Orders'}</p>
              <p className="text-2xl font-bold">{combinedStats.totalOrders}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-sm text-muted-foreground">{language === 'so' ? 'Dakhli Guud' : 'Total Revenue'}</p>
              <p className="text-2xl font-bold text-green-600">${combinedStats.revenue.toFixed(2)}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-sm text-muted-foreground">{language === 'so' ? "Faa'iido Guud" : 'Total Profit'}</p>
              <p className="text-2xl font-bold text-blue-600">${combinedStats.profit.toFixed(2)}</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-sm text-muted-foreground">{language === 'so' ? 'Guul %' : 'Success Rate'}</p>
              <p className="text-2xl font-bold">{combinedStats.successRate.toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {language === 'so' ? '📊 Dalabyo (Isbarbar dhig)' : '📊 Orders Comparison'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Online" fill="#3b82f6" name="Online (USSD)" />
                <Bar dataKey="SMS" fill="#22c55e" name="SMS Offline" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {language === 'so' ? '🥧 Qaybaha Lacagta' : '🥧 Payment Distribution'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {language === 'so' ? '📋 Faahfaahin (Breakdown)' : '📋 Detailed Breakdown'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {breakdownData.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  {language === 'so' ? 'Xog la ma helin' : 'No data found'}
                </div>
              ) : (
                <>
                  {breakdownData.map((row, idx) => (
                    <div key={idx} className="border rounded-lg p-3 bg-card text-xs space-y-1">
                      <div className="font-medium text-sm">{row.label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-blue-600">Online:</span> {row.waafipayOrders} (${row.waafipayRevenue.toFixed(2)})</div>
                        <div><span className="text-green-600">SMS:</span> {row.smsOrders} (${row.smsRevenue.toFixed(2)})</div>
                      </div>
                      <div className="text-right font-bold">{language === 'so' ? 'Wadarta' : 'Total'}: ${row.total.toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="border-2 border-primary/30 rounded-lg p-3 bg-muted/50 text-xs font-bold space-y-1">
                    <div className="text-sm">{language === 'so' ? 'WADARTA' : 'TOTAL'}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><span className="text-blue-600">Online:</span> {waafipayStats.totalOrders} (${waafipayStats.revenue.toFixed(2)})</div>
                      <div><span className="text-green-600">SMS:</span> {smsStats.totalOrders} (${smsStats.revenue.toFixed(2)})</div>
                    </div>
                    <div className="text-right">{language === 'so' ? 'Wadarta' : 'Total'}: ${combinedStats.revenue.toFixed(2)}</div>
                  </div>
                </>
              )}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'so' ? 'Waqti' : 'Period'}</TableHead>
                    <TableHead className="text-center text-blue-600">Online</TableHead>
                    <TableHead className="text-center text-green-600">SMS</TableHead>
                    <TableHead className="text-right text-blue-600">Online $</TableHead>
                    <TableHead className="text-right text-green-600">SMS $</TableHead>
                    <TableHead className="text-right font-bold">{language === 'so' ? 'Wadarta' : 'Total'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdownData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {language === 'so' ? 'Xog la ma helin' : 'No data found'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {breakdownData.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-center">{row.waafipayOrders}</TableCell>
                          <TableCell className="text-center">{row.smsOrders}</TableCell>
                          <TableCell className="text-right">${row.waafipayRevenue.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${row.smsRevenue.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold">${row.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>{language === 'so' ? 'WADARTA' : 'TOTAL'}</TableCell>
                        <TableCell className="text-center">{waafipayStats.totalOrders}</TableCell>
                        <TableCell className="text-center">{smsStats.totalOrders}</TableCell>
                        <TableCell className="text-right">${waafipayStats.revenue.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${smsStats.revenue.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${combinedStats.revenue.toFixed(2)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        </CardContent>
      </Card>
    </div>
  );
};

export default CombinedPaymentAnalytics;
