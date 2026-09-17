import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, KeyRound, Save, Eye, EyeOff } from 'lucide-react';

const COMPANIES = ['Hormuud', 'Somnet', 'Somtel', 'Amtel', 'Somlink'];

interface PinRow { provider_name: string; pin: string; updated_at?: string | null }

export const SimPinsView = ({ isSo }: { isSo: boolean }) => {
  const [pins, setPins] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, PinRow>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [show, setShow] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('sim_pins').select('provider_name, pin, updated_at');
    const map: Record<string, PinRow> = {};
    const vals: Record<string, string> = {};
    (data || []).forEach((r: any) => {
      const key = String(r.provider_name || '').toLowerCase();
      map[key] = r;
      vals[key] = r.pin || '';
    });
    setSaved(map);
    setPins(vals);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const savePin = async (company: string) => {
    const key = company.toLowerCase();
    const pin = (pins[key] || '').trim();
    if (!pin) { toast.error(isSo ? 'Fadlan gali PIN-ka' : 'Enter a PIN'); return; }
    if (!/^\d{3,8}$/.test(pin)) { toast.error(isSo ? 'PIN-ku waa inuu noqdaa 3-8 tiro' : 'PIN must be 3-8 digits'); return; }
    setSavingKey(key);
    const { data, error } = await supabase.rpc('set_sim_pin' as any, { _provider_name: company, _pin: pin });
    setSavingKey(null);
    if (error) { toast.error(error.message); return; }
    const res: any = data || {};
    toast.success(
      isSo
        ? `PIN-ka ${company} waa la kaydiyay — ${res.updated_codes || 0} USSD code ayaa si toos ah u cusboonaaday`
        : `${company} PIN saved — ${res.updated_codes || 0} USSD codes updated automatically`
    );
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="px-3 py-4 space-y-3">
      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 p-3 text-xs text-indigo-800 dark:text-indigo-200">
        {isSo
          ? 'Marka aad PIN-ka shirkad badasho, dhammaan USSD codes-ka iyo auto top-up-ka shirkadaas si toos ah ayaa loo cusboonaysiiyaa.'
          : 'Changing a company PIN automatically updates all USSD codes and auto top-up packages of that company.'}
      </div>

      {COMPANIES.map((company) => {
        const key = company.toLowerCase();
        const row = saved[key];
        const visible = !!show[key];
        return (
          <div key={company} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-8 w-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                <KeyRound className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-sm text-gray-900 dark:text-gray-100">{company}</p>
                <p className="text-[11px] text-gray-500">
                  {row?.pin
                    ? (isSo ? 'PIN waa la kaydiyay' : 'PIN saved')
                    : (isSo ? 'PIN weli lama dhigin' : 'No PIN set yet')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={visible ? 'text' : 'password'}
                  inputMode="numeric"
                  value={pins[key] ?? ''}
                  onChange={(e) => setPins((p) => ({ ...p, [key]: e.target.value.replace(/\D/g, '') }))}
                  placeholder={isSo ? 'PIN-ka SIM-ka' : 'SIM PIN'}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 pr-9 text-sm text-gray-900 dark:text-gray-100"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, [key]: !visible }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  aria-label={visible ? 'hide' : 'show'}
                >
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button
                onClick={() => savePin(company)}
                disabled={savingKey === key}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-medium flex items-center gap-1"
              >
                {savingKey === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSo ? 'Kaydi' : 'Save'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SimPinsView;
