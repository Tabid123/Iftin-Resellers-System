import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Smartphone, CreditCard } from 'lucide-react';

interface Provider {
  id: string;
  provider_name: string;
}

interface AddDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeviceAdded: () => void;
}

export const AddDeviceDialog = ({ open, onOpenChange, onDeviceAdded }: AddDeviceDialogProps) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  
  const [deviceName, setDeviceName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [sim1Number, setSim1Number] = useState('');
  const [sim1Provider, setSim1Provider] = useState('');
  const [sim2Number, setSim2Number] = useState('');
  const [sim2Provider, setSim2Provider] = useState('');

  useEffect(() => {
    if (open) {
      loadProviders();
    }
  }, [open]);

  const loadProviders = async () => {
    const { data, error } = await supabase
      .from('providers_config')
      .select('id, provider_name')
      .eq('is_active', true)
      .order('display_order');
    
    if (error) {
      console.error('Error loading providers:', error);
      return;
    }
    setProviders(data || []);
  };

  const handleSubmit = async () => {
    if (!deviceName || !deviceId || !sim1Number || !sim1Provider) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan buuxi meelaha muhiimka ah' : 'Please fill in required fields',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      // Insert main device record with SIM 1
      const { error: insertError } = await supabase
        .from('android_devices')
        .insert({
          device_name: deviceName,
          device_id: deviceId,
          sim_number: sim1Number,
          provider_name: sim1Provider,
          sim1_provider: sim1Provider.toLowerCase(),
          sim2_provider: sim2Provider ? sim2Provider.toLowerCase() : null,
          is_active: true,
        });

      if (insertError) throw insertError;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'Phone-ka waa la diiwaan galiyay' : 'Device registered successfully',
      });

      // Reset form
      setDeviceName('');
      setDeviceId('');
      setSim1Number('');
      setSim1Provider('');
      setSim2Number('');
      setSim2Provider('');

      onDeviceAdded();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding device:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {language === 'so' ? 'Ku Dar Phone Cusub' : 'Add New Device'}
          </DialogTitle>
          <DialogDescription>
            {language === 'so' 
              ? 'Diiwaan geli phone-ka cusub iyo SIM-yadiisa'
              : 'Register a new phone and its SIM configuration'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Device Info */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Magaca Phone-ka' : 'Device Name'} *</Label>
            <Input
              placeholder={language === 'so' ? 'tusaale: Galaxy A52' : 'e.g. Galaxy A52'}
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{language === 'so' ? 'Device ID' : 'Device ID'} *</Label>
            <Input
              placeholder="IMEI ama ID kale"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {language === 'so' 
                ? 'Tani waa ID-ga app-ka Android-ka u sheeyo server-ka'
                : 'This ID is sent by the Android app to the server'
              }
            </p>
          </div>

          {/* SIM 1 */}
          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <CreditCard className="h-4 w-4 text-primary" />
              SIM 1 *
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{language === 'so' ? 'Lambarka' : 'Number'}</Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="252..."
                  value={sim1Number}
                  onChange={(e) => setSim1Number(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                <Select value={sim1Provider} onValueChange={setSim1Provider}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'so' ? 'Dooro...' : 'Select...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.provider_name}>
                        {p.provider_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* SIM 2 */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center gap-2 font-medium text-muted-foreground">
              <CreditCard className="h-4 w-4" />
              SIM 2 ({language === 'so' ? 'ikhtiyaari' : 'optional'})
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{language === 'so' ? 'Lambarka' : 'Number'}</Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="252..."
                  value={sim2Number}
                  onChange={(e) => setSim2Number(e.target.value.replace(/\D/g, ''))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
                <Select value={sim2Provider} onValueChange={setSim2Provider}>
                  <SelectTrigger>
                    <SelectValue placeholder={language === 'so' ? 'Dooro...' : 'Select...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.provider_name}>
                        {p.provider_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {language === 'so' ? 'Ka noqo' : 'Cancel'}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading 
              ? (language === 'so' ? 'Keydineynaa...' : 'Saving...') 
              : (language === 'so' ? 'Ku Dar' : 'Add Device')
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
