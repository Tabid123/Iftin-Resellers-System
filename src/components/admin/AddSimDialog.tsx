import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2, Plus, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

interface AddSimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PROVIDERS = ['Hormuud', 'Somtel', 'Somnet', 'Somlink', 'Amtel'];

interface SimInput {
  sim_number: string;
  provider_name: string;
}

export const AddSimDialog = ({ open, onOpenChange, onSuccess }: AddSimDialogProps) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [hasDualSim, setHasDualSim] = useState(false);
  const [formData, setFormData] = useState({
    device_name: '',
    device_id: '',
    sim1: { sim_number: '', provider_name: '' } as SimInput,
    sim2: { sim_number: '', provider_name: '' } as SimInput,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.device_name || !formData.sim1.sim_number || !formData.sim1.provider_name) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan buuxi SIM 1 xogtiisa' : 'Please fill SIM 1 details',
        variant: 'destructive',
      });
      return;
    }

    if (hasDualSim && (!formData.sim2.sim_number || !formData.sim2.provider_name)) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan buuxi SIM 2 xogtiisa ama dami' : 'Please fill SIM 2 details or disable it',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const deviceId = formData.device_id || `manual-${Date.now()}`;

      // Insert SIM 1
      const { data: device1, error: error1 } = await supabase
        .from('android_devices')
        .insert([{
          device_id: deviceId,
          device_name: formData.device_name,
          sim_number: formData.sim1.sim_number,
          provider_name: formData.sim1.provider_name,
          is_active: true,
          total_deliveries: 0,
          failed_deliveries: 0,
        }])
        .select()
        .single();

      if (error1) throw error1;

      // Create balances for SIM 1
      await supabase.from('sim_balances').insert([
        { device_id: deviceId, sim_id: device1.id, balance_type: 'evc_plus', balance: 0, balance_source: 'manual' },
        { device_id: deviceId, sim_id: device1.id, balance_type: 'evoucher', balance: 0, balance_source: 'manual' },
      ]);

      // Insert SIM 2 if dual SIM enabled
      if (hasDualSim) {
        const { data: device2, error: error2 } = await supabase
          .from('android_devices')
          .insert([{
            device_id: deviceId, // Same device_id to group them
            device_name: formData.device_name,
            sim_number: formData.sim2.sim_number,
            provider_name: formData.sim2.provider_name,
            is_active: true,
            total_deliveries: 0,
            failed_deliveries: 0,
          }])
          .select()
          .single();

        if (error2) throw error2;

        // Create balances for SIM 2
        await supabase.from('sim_balances').insert([
          { device_id: deviceId, sim_id: device2.id, balance_type: 'evc_plus', balance: 0, balance_source: 'manual' },
          { device_id: deviceId, sim_id: device2.id, balance_type: 'evoucher', balance: 0, balance_source: 'manual' },
        ]);
      }

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' 
          ? `Device ${hasDualSim ? '2 SIM ah' : 'SIM 1 ah'} waa la daray` 
          : `Device with ${hasDualSim ? '2 SIMs' : '1 SIM'} added successfully`,
      });

      // Reset form
      setFormData({
        device_name: '',
        device_id: '',
        sim1: { sim_number: '', provider_name: '' },
        sim2: { sim_number: '', provider_name: '' },
      });
      setHasDualSim(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const SimInputFields = ({ simKey, label }: { simKey: 'sim1' | 'sim2'; label: string }) => (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <div className="font-medium text-sm">{label}</div>
      
      <div className="space-y-2">
        <Label>{language === 'so' ? 'Lambarka SIM' : 'SIM Number'} *</Label>
        <Input
          type="tel"
          inputMode="numeric"
          placeholder="252612345678"
          value={formData[simKey].sim_number}
          onChange={(e) => setFormData({ 
            ...formData, 
            [simKey]: { ...formData[simKey], sim_number: e.target.value }
          })}
        />
      </div>

      <div className="space-y-2">
        <Label>{language === 'so' ? 'Provider-ka' : 'Provider'} *</Label>
        <Select
          value={formData[simKey].provider_name}
          onValueChange={(value) => setFormData({ 
            ...formData, 
            [simKey]: { ...formData[simKey], provider_name: value }
          })}
        >
          <SelectTrigger>
            <SelectValue placeholder={language === 'so' ? 'Dooro' : 'Select'} />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {language === 'so' ? '📱 Device Cusub Ku Dar' : '📱 Add New Device'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Device Info */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Magaca Device-ka *' : 'Device Name *'}</Label>
            <Input
              placeholder={language === 'so' ? 'Tusaale: Samsung A54' : 'e.g., Samsung A54'}
              value={formData.device_name}
              onChange={(e) => setFormData({ ...formData, device_name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Device ID (ikhtiyaari)' : 'Device ID (optional)'}</Label>
            <Input
              placeholder={language === 'so' ? 'Auto-generated haddii loo daayo' : 'Auto-generated if empty'}
              value={formData.device_id}
              onChange={(e) => setFormData({ ...formData, device_id: e.target.value })}
            />
          </div>

          {/* Dual SIM Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="font-medium">{language === 'so' ? 'Dual SIM?' : 'Dual SIM?'}</div>
              <div className="text-sm text-muted-foreground">
                {language === 'so' ? 'Device-kan ma leeyahay 2 SIM?' : 'Does this device have 2 SIMs?'}
              </div>
            </div>
            <Switch checked={hasDualSim} onCheckedChange={setHasDualSim} />
          </div>

          {/* SIM 1 */}
          <SimInputFields simKey="sim1" label="SIM 1" />

          {/* SIM 2 (conditional) */}
          {hasDualSim && <SimInputFields simKey="sim2" label="SIM 2" />}

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'so' ? 'Ku Dar' : 'Add Device'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
