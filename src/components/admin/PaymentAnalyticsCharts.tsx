import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, TrendingUp, PieChart as PieChartIcon, Clock } from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval, eachHourOfInterval, startOfToday, endOfToday } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';

interface DailyTrend {
  date: string;
  count: number;
  amount: number;
  matched: number;
  unmatched: number;
}

interface ProviderStat {
  name: string;
  count: number;
  amount: number;
}

interface HourlyStat {
  hour: string;
  count: number;
}

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function PaymentAnalyticsCharts() {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState('7days');
  const [dailyTrends, setDailyTrends] = useState<DailyTrend[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStat[]>([]);
  const [hourlyStats, setHourlyStats] = useState<HourlyStat[]>([]);
  const [totals, setTotals] = useState({ count: 0, amount: 0, matchRate: 0 });

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 1;
      const dateFrom = startOfDay(subDays(new Date(), days));
      
      // Fetch payment receipts with orders
      const { data: receipts, error } = await supabase
        .from('payment_receipts')
        .select(`
          id, amount, status, created_at,
          order:matched_order_id (provider_id)
        `)
        .gte('created_at', dateFrom.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch provider names
      const { data: providers } = await supabase
        .from('providers_config')
        .select('id, provider_name');

      const providerMap = new Map(providers?.map(p => [p.id, p.provider_name]) || []);

      // Process daily trends
      const dateInterval = eachDayOfInterval({ start: dateFrom, end: new Date() });
      const dailyData: DailyTrend[] = dateInterval.map(date => {
        const dayReceipts = receipts?.filter(r => 
          r.created_at && format(new Date(r.created_at), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
        ) || [];
        
        return {
          date: format(date, 'MMM dd'),
          count: dayReceipts.length,
          amount: dayReceipts.reduce((sum, r) => sum + (r.amount || 0), 0),
          matched: dayReceipts.filter(r => r.status === 'matched').length,
          unmatched: dayReceipts.filter(r => r.status === 'unmatched').length
        };
      });
      setDailyTrends(dailyData);

      // Process provider stats
      const providerCounts = new Map<string, { count: number; amount: number }>();
      receipts?.forEach(r => {
        const orderId = (r.order as any)?.provider_id;
        const providerName: string = orderId ? (providerMap.get(orderId) as string) || 'Unknown' : 'Unmatched';
        const current = providerCounts.get(providerName) || { count: 0, amount: 0 };
        providerCounts.set(providerName, {
          count: current.count + 1,
          amount: current.amount + (r.amount || 0)
        });
      });
      
      const providerData: ProviderStat[] = Array.from(providerCounts.entries())
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.count - a.count);
      setProviderStats(providerData);

      // Process hourly distribution (for today)
      const todayReceipts = receipts?.filter(r => 
        r.created_at && new Date(r.created_at) >= startOfToday()
      ) || [];
      
      const hourlyData: HourlyStat[] = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i.toString().padStart(2, '0')}:00`,
        count: todayReceipts.filter(r => 
          r.created_at && new Date(r.created_at).getHours() === i
        ).length
      }));
      setHourlyStats(hourlyData);

      // Calculate totals
      const totalCount = receipts?.length || 0;
      const totalAmount = receipts?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;
      const matchedCount = receipts?.filter(r => r.status === 'matched').length || 0;
      setTotals({
        count: totalCount,
        amount: totalAmount,
        matchRate: totalCount > 0 ? Math.round((matchedCount / totalCount) * 100) : 0
      });

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {language === 'so' ? 'Falanqaynta Lacagaha' : 'Payment Analytics'}
        </h3>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
            <SelectItem value="7days">{language === 'so' ? '7 Maalmood' : '7 Days'}</SelectItem>
            <SelectItem value="30days">{language === 'so' ? '30 Maalmood' : '30 Days'}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold">{totals.count}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'so' ? 'Wadarta Payments' : 'Total Payments'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold text-green-600">${totals.amount.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">
              {language === 'so' ? 'Wadarta Lacagta' : 'Total Amount'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-3xl font-bold text-primary">{totals.matchRate}%</p>
            <p className="text-sm text-muted-foreground">
              {language === 'so' ? 'Heerka Match' : 'Match Rate'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trends Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            {language === 'so' ? 'Isbedelka Maalinlaha' : 'Daily Payment Trends'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrends}>
                <defs>
                  <linearGradient id="colorMatched" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorUnmatched" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="matched" 
                  stackId="1"
                  stroke="#22c55e" 
                  fill="url(#colorMatched)"
                  name="Matched"
                />
                <Area 
                  type="monotone" 
                  dataKey="unmatched" 
                  stackId="1"
                  stroke="#ef4444" 
                  fill="url(#colorUnmatched)"
                  name="Unmatched"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4" />
              {language === 'so' ? 'Shirkadaha' : 'By Provider'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={providerStats}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {providerStats.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number, name: string, props: any) => [
                      `${value} payments ($${props.payload.amount.toFixed(2)})`,
                      name
                    ]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Provider Legend */}
            <div className="mt-2 flex flex-wrap gap-2 justify-center">
              {providerStats.map((stat, i) => (
                <div key={stat.name} className="flex items-center gap-1 text-xs">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span>{stat.name}: {stat.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Hourly Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {language === 'so' ? 'Saacadaha Maanta' : "Today's Hourly Distribution"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyStats}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fontSize: 10 }} 
                    interval={2}
                    className="text-muted-foreground"
                  />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                    name={language === 'so' ? 'Payments' : 'Payments'}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
