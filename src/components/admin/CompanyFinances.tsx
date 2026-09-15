import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wallet, Percent, Save } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';

interface ProviderBalance {
  provider_name: string;
  evoucher_balance: number;
  evc_plus_balance: number;
  sim_count: number;
  evoucher_rate: number;
}

interface ProviderRate {
  id: string;
  provider_name: string;
  evoucher_rate: number;
}

// Show the rate exactly as entered (no forced rounding to 1 decimal).
const formatRatePercent = (rate: number) => {
  const pct = Number(rate || 0) * 100;
  return String(Number(pct.toFixed(6)));
};

const getProviderBorderColor = (name: string) => {
  switch (name.toLowerCase()) {
    case 'hormuud': return 'border-l-hormuud';
    case 'somtel': return 'border-l-somtel';
    case 'somnet': return 'border-l-somnet';
    case 'somlink': return 'border-l-somlink';
    case 'amtel': return 'border-l-amtel';
    default: return 'border-l-primary';
  }
};

const getProviderBg = (name: string) => {
  switch (name.toLowerCase()) {
    case 'hormuud': return 'bg-hormuud/5 dark:bg-hormuud/10';
    case 'somtel': return 'bg-somtel/5 dark:bg-somtel/10';
    case 'somnet': return 'bg-somnet/5 dark:bg-somnet/10';
    case 'somlink': return 'bg-somlink/5 dark:bg-somlink/10';
    case 'amtel': return 'bg-amtel/5 dark:bg-amtel/10';
    default: return 'bg-primary/5';
  }
};

const getProviderTextColor = (name: string) => {
  switch (name.toLowerCase()) {
    case 'hormuud': return 'text-hormuud';
    case 'somtel': return 'text-somtel';
    case 'somnet': return 'text-somnet';
    case 'somlink': return 'text-somlink';
    case 'amtel': return 'text-amtel';
    default: return 'text-primary';
  }
};

export function CompanyFinances() {
  const { language } = useLanguage();
  const [providerBalances, setProviderBalances] = useState<ProviderBalance[]>([]);
  const [providerRates, setProviderRates] = useState<ProviderRate[]>([]);
  const [editingRates, setEditingRates] = useState<Record<string, string>>({});
  const [savingRates, setSavingRates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadProviderRates = useCallback(async () => {
    try {
      const { data: providers } = await supabase
        .from('providers_config')
        .select('id, provider_name, evoucher_rate')
        .order('display_order');
      
      if (providers) {
        setProviderRates(providers.map(p => ({
          id: p.id,
          provider_name: p.provider_name,
          evoucher_rate: Number(p.evoucher_rate || 0)
        })));
        const rates: Record<string, string> = {};
        providers.forEach(p => {
          rates[p.id] = formatRatePercent(Number(p.evoucher_rate || 0));
        });
        setEditingRates(rates);
      }
    } catch (error) {
      console.error('Error loading provider rates:', error);
    }
  }, []);

  const loadProviderBalances = useCallback(async () => {
    try {
      const { data: devices } = await supabase
        .from('android_devices')
        .select('id, provider_name, sim1_provider, sim2_provider')
        .eq('is_active', true)
        .is('archived_at', null);

      const { data: balances } = await supabase
        .from('sim_balances')
        .select('device_id, balance_type, balance, sim_slot');

      const { data: providers } = await supabase
        .from('providers_config')
        .select('provider_name, evoucher_rate');

      const rateMap = new Map<string, number>();
      providers?.forEach(p => {
        rateMap.set(p.provider_name.toLowerCase(), Number(p.evoucher_rate || 0));
      });

      const providerMap = new Map<string, ProviderBalance>();
      
      devices?.forEach(device => {
        const sim1Balances = balances?.filter(b => b.device_id === device.id && (!b.sim_slot || b.sim_slot === 1)) || [];
        const sim1Provider = device.sim1_provider || device.provider_name;
        const sim1Evoucher = Number(sim1Balances.find(b => b.balance_type === 'evoucher')?.balance || 0);
        const sim1EvcPlus = Number(sim1Balances.find(b => b.balance_type === 'evc_plus')?.balance || 0);
        const sim1Rate = rateMap.get(sim1Provider.toLowerCase()) || 0;
        
        if (providerMap.has(sim1Provider)) {
          const existing = providerMap.get(sim1Provider)!;
          existing.evoucher_balance += sim1Evoucher;
          existing.evc_plus_balance += sim1EvcPlus;
          existing.sim_count += 1;
        } else {
          providerMap.set(sim1Provider, {
            provider_name: sim1Provider,
            evoucher_balance: sim1Evoucher,
            evc_plus_balance: sim1EvcPlus,
            sim_count: 1,
            evoucher_rate: sim1Rate
          });
        }
        
        if (device.sim2_provider) {
          const sim2Balances = balances?.filter(b => b.device_id === device.id && b.sim_slot === 2) || [];
          const sim2Provider = device.sim2_provider;
          const sim2Evoucher = Number(sim2Balances.find(b => b.balance_type === 'evoucher')?.balance || 0);
          const sim2EvcPlus = Number(sim2Balances.find(b => b.balance_type === 'evc_plus')?.balance || 0);
          const sim2Rate = rateMap.get(sim2Provider.toLowerCase()) || 0;
          
          if (providerMap.has(sim2Provider)) {
            const existing = providerMap.get(sim2Provider)!;
            existing.evoucher_balance += sim2Evoucher;
            existing.evc_plus_balance += sim2EvcPlus;
            existing.sim_count += 1;
          } else {
            providerMap.set(sim2Provider, {
              provider_name: sim2Provider,
              evoucher_balance: sim2Evoucher,
              evc_plus_balance: sim2EvcPlus,
              sim_count: 1,
              evoucher_rate: sim2Rate
            });
          }
        }
      });
      
      setProviderBalances(Array.from(providerMap.values()));
    } catch (error) {
      console.error('Error loading provider balances:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProviderRate = async (providerId: string) => {
    setSavingRates(prev => ({ ...prev, [providerId]: true }));
    try {
      const ratePercent = parseFloat(editingRates[providerId] || '0');
      const rateDecimal = ratePercent / 100;
      
      const { error } = await supabase
        .from('providers_config')
        .update({ evoucher_rate: rateDecimal })
        .eq('id', providerId);
      
      if (error) throw error;
      
      toast.success(language === 'so' ? 'Rate-ka waa la keydiyay' : 'Rate saved successfully');
      loadProviderRates();
    } catch (error) {
      console.error('Error saving rate:', error);
      toast.error(language === 'so' ? 'Khalad baa dhacay' : 'Failed to save rate');
    } finally {
      setSavingRates(prev => ({ ...prev, [providerId]: false }));
    }
  };

  useEffect(() => {
    loadProviderBalances();
    loadProviderRates();

    const channel = supabase
      .channel('company-finances-balances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sim_balances' }, () => {
        loadProviderBalances();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadProviderBalances, loadProviderRates]);

  // Calculate totals
  const hormuudProvider = providerBalances.find(p => p.provider_name.toLowerCase().includes('hormuud'));
  const totalEvoucher = providerBalances.reduce((sum, p) => {
    const isHormuud = p.provider_name.toLowerCase().includes('hormuud');
    if (isHormuud) return sum + p.evoucher_balance;
    return sum + (p.evoucher_balance || p.evc_plus_balance);
  }, 0);
  const totalEvcPlus = hormuudProvider?.evc_plus_balance || 0;
  const grandTotal = totalEvoucher + totalEvcPlus;

  return (
    <div className="space-y-4">
      {/* E-Voucher Rate Settings */}
      <Card>
        <CardHeader className="p-3 md:p-6 pb-2">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Percent className="h-4 w-4 md:h-5 md:w-5" />
            {language === 'so' ? 'E-Voucher Rate Settings' : 'E-Voucher Rate Settings'}
          </CardTitle>
          <CardDescription className="text-xs md:text-sm">
            {language === 'so' 
              ? "Badal rate-ka shirkad walba - faa'iidada waxay ku salaysnaatay formula: profit = (selling_price × (1 + rate)) - cost_price"
              : 'Set the e-voucher rate for each provider'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 md:p-6 pt-0">
          <div className="grid gap-2 md:gap-3 grid-cols-2 lg:grid-cols-3">
            {providerRates.map(provider => (
              <div key={provider.id} className={`flex items-center gap-2 p-2.5 md:p-3 rounded-lg border ${getProviderBg(provider.provider_name)}`}>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-xs md:text-sm ${getProviderTextColor(provider.provider_name)}`}>{provider.provider_name}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">
                    {language === 'so' ? 'Rate hadda' : 'Current'}: {formatRatePercent(provider.evoucher_rate)}%
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.01"
                    className="w-16 md:w-20 h-7 md:h-8 text-xs md:text-sm"
                    value={editingRates[provider.id] || '0'}
                    onChange={(e) => setEditingRates(prev => ({ ...prev, [provider.id]: e.target.value }))}
                    placeholder="%"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-7 md:h-8 w-7 md:w-8 p-0"
                    onClick={() => saveProviderRate(provider.id)}
                    disabled={savingRates[provider.id]}
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
