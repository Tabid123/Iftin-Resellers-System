import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { resolveTenantId } from '@/lib/iftinCatalog';
import { listPartnerIntents, type PartnerIntentsData, type PartnerReportAgg } from '@/lib/iftinIntents.functions';
import { EmptyState, LazyFallback } from './simple/shared';

const TZ = 'Africa/Mogadishu';
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });

const dayKey = (iso?: string | null) => (iso ? isoDayFmt.format(new Date(iso)) : '');
const todayKey = () => isoDayFmt.format(new Date());
const money = (n: number) => `$${n.toFixed(2)}`;

type Agg = { orders: number; sales: number; cost: number; profit: number };
const emptyAgg = (): Agg => ({ orders: 0, sales: 0, cost: 0, profit: 0 });

const PERIODS = ['today', 'week', 'month', 'year'] as const;
type PeriodKey = (typeof PERIODS)[number];
const periodLabel: Record<PeriodKey, string> = {
  today: 'Maanta',
  week: 'Isbuucan',
  month: 'Bishaan',
  year: 'Sanadkan',
};
const periodDays: Record<PeriodKey, number> = { today: 1, week: 7, month: 30, year: 365 };

const IftinReport: React.FC<{ isSo?: boolean }> = () => {
  const [report, setReport] = useState<PartnerIntentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayKey());
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [provider, setProvider] = useState('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const tenantId = await resolveTenantId();
      if (!tenantId) throw new Error('Reseller-ka lama garanayo');

      const selectedStart = new Date(`${date}T00:00:00+03:00`).getTime();
      const periodStart = period === 'today'
        ? new Date(`${todayKey()}T00:00:00+03:00`).getTime()
        : Date.now() - periodDays[period] * 86_400_000;
      const start = new Date(Math.min(selectedStart, periodStart)).toISOString();

      const res = await listPartnerIntents({
        data: { tenantId, limit: 1, offset: 0, includeUnpaid: false, start },
      });
      setReport(res);
    } catch (e: any) {
      setError(e?.message ?? 'Xogta lama soo dejin');
    } finally {
      setLoading(false);
    }
  }, [date, period]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(true), 120_000);
    return () => clearInterval(t);
  }, [load]);

  const byProvider = useMemo(() => {
    return (report?.by_provider_day ?? [])
      .filter((row) => row.day === date)
      .map((row) => [row.name ?? 'Kale', {
        orders: Number(row.orders || 0),
        sales: Number(row.sales || 0),
        cost: Number(row.cost || 0),
        profit: Number(row.profit || 0),
      }] as [string, Agg])
      .sort((a, b) => b[1].orders - a[1].orders);
  }, [report, date]);

  const providerTotals = byProvider.reduce((acc, [, a]) => {
    acc.orders += a.orders; acc.sales += a.sales; acc.cost += a.cost; acc.profit += a.profit;
    return acc;
  }, emptyAgg());

  const byDay = useMemo(() => {
    const cutoff = period === 'today'
      ? todayKey()
      : isoDayFmt.format(new Date(Date.now() - periodDays[period] * 86_400_000));
    const source = report?.by_provider_day ?? [];
    const map = new Map<string, Agg>();
    source
      .filter((row) => String(row.day || '') >= cutoff)
      .filter((row) => provider === 'all' || row.name === provider)
      .forEach((row: PartnerReportAgg) => {
        const key = String(row.day || '');
        if (!key) return;
        const agg = map.get(key) ?? emptyAgg();
        agg.orders += Number(row.orders || 0);
        agg.sales += Number(row.sales || 0);
        agg.cost += Number(row.cost || 0);
        agg.profit += Number(row.profit || 0);
        map.set(key, agg);
      });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [report, period, provider]);

  const providerOptions = useMemo(
    () => [...new Set((report?.by_provider_day ?? []).map((row) => row.name).filter(Boolean) as string[])].sort(),
    [report],
  );

  if (loading && !report) return <LazyFallback />;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 p-3 text-sm">{error}</div>
      )}

      {/* Shirkad Walba */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-border shadow-sm p-3 sm:p-4 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-bold flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 shrink-0 text-primary" /> Shirkad Walba
            </h3>
            <p className="text-xs text-muted-foreground">
              Dalabyadii la diray {date} shirkad walba si gooni ah
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 max-w-[130px]"
            />
            <button
              onClick={() => void load()}
              className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {byProvider.length === 0 ? (
          <EmptyState message="Maalintan wax dalab ah lama helin" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 sm:hidden">
              {byProvider.map(([name, a]) => (
                <div key={name} className="rounded-lg border border-border p-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="font-bold truncate">{name}</span>
                    <span className="shrink-0 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                      {a.orders} dalab
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Dakhli</div>
                      <div className="font-semibold">{money(a.sales)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Kharash</div>
                      <div className="font-semibold text-orange-600">{money(a.cost)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Faa'iido</div>
                      <div className="font-bold text-emerald-600">{money(a.profit)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-muted/50 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold">Wadarta</span>
                  <span className="font-bold">{providerTotals.orders} dalab</span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Dakhli</div>
                    <div className="font-bold">{money(providerTotals.sales)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Kharash</div>
                    <div className="font-bold text-red-600">{money(providerTotals.cost)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Faa'iido</div>
                    <div className="font-bold text-emerald-600">{money(providerTotals.profit)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border">
                    <th className="text-left py-2 font-medium">Shirkad</th>
                    <th className="text-right py-2 font-medium">Dalabyo</th>
                    <th className="text-right py-2 font-medium">Dakhli</th>
                    <th className="text-right py-2 font-medium">Kharash</th>
                    <th className="text-right py-2 font-medium">Faa'iido</th>
                  </tr>
                </thead>
                <tbody>
                  {byProvider.map(([name, a]) => (
                    <tr key={name} className="border-b border-border/60">
                      <td className="py-2.5 font-semibold">{name}</td>
                      <td className="py-2.5 text-right">{a.orders}</td>
                      <td className="py-2.5 text-right">{money(a.sales)}</td>
                      <td className="py-2.5 text-right text-orange-600">{money(a.cost)}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-600">{money(a.profit)}</td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40">
                    <td className="py-2.5 font-bold">Wadarta</td>
                    <td className="py-2.5 text-right font-bold">{providerTotals.orders}</td>
                    <td className="py-2.5 text-right font-bold">{money(providerTotals.sales)}</td>
                    <td className="py-2.5 text-right font-bold text-red-600">{money(providerTotals.cost)}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600">{money(providerTotals.profit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Faahfaahin Taariikhda */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-border shadow-sm p-3 sm:p-4 space-y-3">
        <div>
          <h3 className="text-base font-bold flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 shrink-0 text-primary" /> Faahfaahin Taariikhda
          </h3>
          <p className="text-xs text-muted-foreground">
            Muuji maalin walba natiijada (dalabyadii la diray kaliya)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((k) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium border ${
                period === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'
              }`}
            >
              {periodLabel[k]}
            </button>
          ))}
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="text-xs rounded-lg border border-border bg-background px-2 py-1.5 ml-auto"
          >
            <option value="all">Dhammaan</option>
            {providerOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        {byDay.length === 0 ? (
          <EmptyState message="Muddadan wax dalab ah lama helin" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 sm:hidden">
              {byDay.map(([key, a]) => (
                <div key={key} className="rounded-lg border border-border p-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <span className="font-semibold truncate">
                      {dayLabelFmt.format(new Date(`${key}T12:00:00Z`))}
                    </span>
                    <span className="shrink-0 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                      {a.orders}
                    </span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[11px]">
                    <div>
                      <div className="text-muted-foreground">Dakhli</div>
                      <div className="font-semibold">{money(a.sales)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Kharash</div>
                      <div className="font-semibold text-orange-600">{money(a.cost)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Faa'iido</div>
                      <div className="font-bold text-emerald-600">{money(a.profit)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs border-b border-border">
                    <th className="text-left py-2 font-medium">Maalin</th>
                    <th className="text-right py-2 font-medium">Dalabyo</th>
                    <th className="text-right py-2 font-medium">Dakhli</th>
                    <th className="text-right py-2 font-medium">Kharash</th>
                    <th className="text-right py-2 font-medium">Faa'iido</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map(([key, a]) => (
                    <tr key={key} className="border-b border-border/60">
                      <td className="py-2.5 font-semibold whitespace-nowrap">
                        {dayLabelFmt.format(new Date(`${key}T12:00:00Z`))}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className="inline-block min-w-[34px] rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 px-2 py-0.5 text-xs font-semibold">
                          {a.orders}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">{money(a.sales)}</td>
                      <td className="py-2.5 text-right text-orange-600">{money(a.cost)}</td>
                      <td className="py-2.5 text-right font-bold text-emerald-600">{money(a.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

    </div>
  );
};

export default IftinReport;
