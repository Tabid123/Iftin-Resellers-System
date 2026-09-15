import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Phone } from 'lucide-react';
import { toast } from 'sonner';

interface AppSetting {
  id: string;
  setting_key: string;
  text_value: string | null;
  description: string;
}

const OfflinePaymentSettings = () => {
  const queryClient = useQueryClient();
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentPrefix, setPaymentPrefix] = useState('');
  const [hasNumberChanges, setHasNumberChanges] = useState(false);
  const [hasPrefixChanges, setHasPrefixChanges] = useState(false);

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['offlinePaymentSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .in('setting_key', ['payment_number', 'payment_prefix']);
      
      if (error) throw error;
      return data as AppSetting[];
    },
  });

  // Initialize state when settings load
  React.useEffect(() => {
    if (settings.length > 0) {
      const numberSetting = settings.find(s => s.setting_key === 'payment_number');
      const prefixSetting = settings.find(s => s.setting_key === 'payment_prefix');
      
      if (numberSetting?.text_value) setPaymentNumber(numberSetting.text_value);
      if (prefixSetting?.text_value) setPaymentPrefix(prefixSetting.text_value);
    }
  }, [settings]);

  const updateSetting = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ text_value: value })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offlinePaymentSettings'] });
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Settings la kaydisey si guul leh!');
    },
    onError: (error) => {
      toast.error('Khalad ayaa dhacay!');
      console.error('Error updating setting:', error);
    },
  });

  const handleNumberChange = (value: string) => {
    setPaymentNumber(value);
    const original = settings.find(s => s.setting_key === 'payment_number')?.text_value;
    setHasNumberChanges(value !== original);
  };

  const handlePrefixChange = (value: string) => {
    setPaymentPrefix(value);
    const original = settings.find(s => s.setting_key === 'payment_prefix')?.text_value;
    setHasPrefixChanges(value !== original);
  };

  const handleSaveNumber = () => {
    const setting = settings.find(s => s.setting_key === 'payment_number');
    if (setting) {
      updateSetting.mutate({ id: setting.id, value: paymentNumber });
      setHasNumberChanges(false);
    }
  };

  const handleSavePrefix = () => {
    const setting = settings.find(s => s.setting_key === 'payment_prefix');
    if (setting) {
      updateSetting.mutate({ id: setting.id, value: paymentPrefix });
      setHasPrefixChanges(false);
    }
  };

  const handleCallNumber = () => {
    if (paymentNumber) {
      window.open(`tel:${paymentNumber}`, '_self');
    }
  };

  if (isLoading) {
    return <div className="p-4">Raadinta settings...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Offline Payment Settings</h2>
        <p className="text-muted-foreground">
          Halkan ka maaree lambarka lacagta iyo prefix-ka USSD code-ka ee offline mode
        </p>
      </div>

      <div className="space-y-4">
        {/* Payment Number Setting */}
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="payment-number" className="text-base font-medium">
                Lambarka Lacagta
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Lambarka lacagta lagu diraayo ee offline mode (tusaale: 617195659)
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Input
                id="payment-number"
                value={paymentNumber}
                onChange={(e) => handleNumberChange(e.target.value)}
                className="flex-1"
                placeholder="617195659"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={handleCallNumber}
                disabled={!paymentNumber}
                title="Call this number"
              >
                <Phone className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleSaveNumber}
                disabled={!hasNumberChanges}
                className="min-w-[100px]"
              >
                <Save className="w-4 h-4 mr-2" />
                Kaydi
              </Button>
            </div>

            {paymentNumber && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">Lambarka buuxa:</p>
                <p className="text-lg font-mono font-bold text-foreground">+252 {paymentNumber}</p>
              </div>
            )}
          </div>
        </Card>

        {/* USSD Prefix Setting */}
        <Card className="p-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="ussd-prefix" className="text-base font-medium">
                Prefix-ka USSD Code-ka
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Bilowga USSD code-ka ee payment-ka (tusaale: *712*)
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Input
                id="ussd-prefix"
                value={paymentPrefix}
                onChange={(e) => handlePrefixChange(e.target.value)}
                className="flex-1"
                placeholder="*712*"
              />
              <Button
                onClick={handleSavePrefix}
                disabled={!hasPrefixChanges}
                className="min-w-[100px]"
              >
                <Save className="w-4 h-4 mr-2" />
                Kaydi
              </Button>
            </div>

            {paymentNumber && paymentPrefix && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">USSD Code tusaale (lacag $5):</p>
                <p className="text-lg font-mono font-bold text-foreground">
                  {paymentPrefix}{paymentNumber}*5#
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default OfflinePaymentSettings;
