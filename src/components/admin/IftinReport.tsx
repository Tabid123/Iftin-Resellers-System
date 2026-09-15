import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, TrendingUp } from 'lucide-react';
import { resolveTenantId } from '@/lib/iftinCatalog';
import { listPartnerIntents, type PartnerIntent } from '@/lib/iftinIntents.functions';
import { EmptyState, LazyFallback } from './simple/shared';

const TZ = 'Africa/Mogadishu';
const isoDayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabelFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });

const dayKey = (iso?: string | null) => (iso ? isoDayFmt.format(new Date(iso)) : '');
const todayKey = () => isoDayFmt.format(new Date());
const money = (n: number) => `$${n.toFixed(2)}`;

const NAME_MATCH: Array<[string, string[]]> = [
  ['Hormuud', ['hormuud', 'evc']],
  ['Somtel', ['somtel', 'edahab', 'e-dahab']],
  ['Somnet', ['somnet', 'jeeb']],
  ['Somlink', ['somlink']],
  ['Amtel', ['amtel']],
  ['Telesom', ['telesom', 'zaad']],
  ['Golis', ['golis', 'sahal']],
  ['Nationlink', ['nationlink', 'nation link']],
];
const PREFIX_MATCH: Record<string, string> = {
  '61': 'Hormuud', '77': 'Hormuud',
  '62': 'Somtel', '68': 'Somnet', '64': 'Somlink',
  '71': 'Amtel', '63': 'Telesom',
  '90': 'Golis', '85': 'Golis',
  '67': 'Nationlink', '69': 'Nationlink',
};

const providerOf = (p: PartnerIntent) => {
  const raw = p as unknown as Record<string, unknown>;
  const text = [raw['provider_name'], raw['provider'], raw['network'], p.package_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const byName = NAME_MATCH.find(([, keys]) => keys.some((k) => text.includes(k)));
  if (byName) return byName[0];
  const phone = String(p.receiver_phone ?? '').replace(/\D/g, '').replace(/^252/, '');
  return PREFIX_MATCH[phone.slice(0, 2)] ?? 'Kale';
};


type Agg = { orders: number; sales: number; cost: number; profit: number };
const emptyAgg = (): Agg => ({ orders: 0, sales: 0, cost: 0, profit: 0 });
const addTo = (a: Agg, i: PartnerIntent) => {
  a.orders += 1;
  a.sales += Number(i.amount ?? 0);
  a.cost += Number(i.base_price ?? 0);
  a.profit += Number(i.your_profit ?? 0);
};

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
  const [intents, setIntents] = useState<PartnerIntent[] | null>(null);
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
      const res = await listPartnerIntents({ data: { tenantId, limit: 200, includeUnpaid: false } });
      setIntents((res.intents ?? []).filter((i) => i.counts_as_order === true));
    } catch (e: any) {
      setError(e?.message ?? 'Xogta lama soo dejin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const delivered = useMemo(
    () => (intents ?? []).filter((i) => i.result === 'delivered'),
    [intents],
  );

  const byProvider = useMemo(() => {
    const map = new Map<string, Agg>();
    delivered.filter((i) => dayKey(i.created_at) === date).forEach((i) => {
      const key = providerOf(i);
      if (!map.has(key)) map.set(key, emptyAgg());
      addTo(map.get(key)!, i);
    });
    return [...map.entries()].sort((a, b) => b[1].orders - a[1].orders);
  }, [delivered, date]);

  const providerTotals = byProvider.reduce((acc, [, a]) => {
    acc.orders += a.orders; acc.sales += a.sales; acc.cost += a.cost; acc.profit += a.profit;
    return acc;
  }, emptyAgg());

  const byDay = useMemo(() => {
    const cutoff = Date.now() - periodDays[period] * 86_400_000;
    const map = new Map<string, Agg>();
    delivered
      .filter((i) => provider === 'all' || providerOf(i) === provider)
      .filter((i) => (period === 'today'
        ? dayKey(i.created_at) === todayKey()
        : i.created_at && new Date(i.created_at).getTime() >= cutoff))
      .forEach((i) => {
        const key = dayKey(i.created_at);
        if (!map.has(key)) map.set(key, emptyAgg());
        addTo(map.get(key)!, i);
      });
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [delivered, period, provider]);

  const providerOptions = useMemo(
    () => [...new Set(delivered.map(providerOf))].sort(),
    [delivered],
  );

  if (loading && !intents) return <LazyFallback />;

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
