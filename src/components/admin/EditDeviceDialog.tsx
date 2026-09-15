import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

const PROVIDERS = ['Hormuud', 'Somnet', 'Somtel', 'Amtel', 'Somlink'];
const clampPriority = (value: number) => Math.min(5, Math.max(1, Number.isFinite(value) ? Math.trunc(value) : 1));

interface EditDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: {
    id: string;
    device_id: string;
    device_name: string;
    sim_number: string;
    sim2_number: string | null;
    sim1_provider: string | null;
    sim2_provider: string | null;
    sim1_priority?: number | null;
    sim2_priority?: number | null;
    sim1_enabled?: boolean | null;
    sim2_enabled?: boolean | null;
  } | null;
  onSuccess: () => void;
}

export const EditDeviceDialog = ({
  open,
  onOpenChange,
  device,
  onSuccess,
}: EditDeviceDialogProps) => {
  const { language } = useLanguage();
  const [deviceName, setDeviceName] = useState('');
  const [simNumber, setSimNumber] = useState('');
  const [sim2Number, setSim2Number] = useState('');
  const [sim1Provider, setSim1Provider] = useState<string>('');
  const [sim2Provider, setSim2Provider] = useState<string>('');
  const [sim1Priority, setSim1Priority] = useState(1);
  const [sim2Priority, setSim2Priority] = useState(1);
  const [sim1Enabled, setSim1Enabled] = useState(true);
  const [sim2Enabled, setSim2Enabled] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (device && open) {
      setDeviceName(device.device_name || '');
      setSimNumber(device.sim_number || '');
      setSim2Number(device.sim2_number || '');
      setSim1Provider(device.sim1_provider || '');
      setSim2Provider(device.sim2_provider || '');
      setSim1Priority(clampPriority(Number(device.sim1_priority ?? 1)));
      setSim2Priority(clampPriority(Number(device.sim2_priority ?? 1)));
      setSim1Enabled(device.sim1_enabled !== false);
      setSim2Enabled(device.sim2_enabled !== false);
    }
  }, [device, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deviceName.trim()) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Magaca device-ka waa loo baahan yahay' : 'Device name is required',
        variant: 'destructive',
      });
      return;
    }

    if (!device) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('android_devices')
        .update({
          device_name: deviceName.trim(),
          sim_number: simNumber.trim() || device.sim_number,
          sim2_number: sim2Number.trim() || null,
          sim1_provider: sim1Provider || null,
          sim2_provider: sim2Provider || null,
          sim1_priority: clampPriority(sim1Priority),
          sim2_priority: clampPriority(sim2Priority),
          sim1_enabled: sim1Enabled,
          sim2_enabled: sim2Enabled,
        })
        .eq('id', device.id);

      if (error) throw error;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so'
          ? 'Device-ka iyo kala hormarinta SIM-yada waa la kaydiyay'
          : 'Device and SIM priority settings updated',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error updating device:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so'
          ? 'Wax khaldan ayaa dhacay. Fadlan isku day mar kale.'
          : 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const SimRoutingFields = ({ slot }: { slot: 1 | 2 }) => {
    const provider = slot === 1 ? sim1Provider : sim2Provider;
    const setProvider = slot === 1 ? setSim1Provider : setSim2Provider;
    const priority = slot === 1 ? sim1Priority : sim2Priority;
    const setPriority = slot === 1 ? setSim1Priority : setSim2Priority;
    const enabled = slot === 1 ? sim1Enabled : sim2Enabled;
    const setEnabled = slot === 1 ? setSim1Enabled : setSim2Enabled;

    return (
      <div className="rounded-xl border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold text-sm">SIM {slot}</div>
            <div className="text-xs text-muted-foreground">
              {language === 'so' ? 'Provider, priority iyo xaaladda SIM-ka' : 'Provider, priority and SIM status'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`sim${slot}-enabled`} className="text-xs">
              {enabled ? (language === 'so' ? 'Furan' : 'Enabled') : (language === 'so' ? 'Xiran' : 'Disabled')}
            </Label>
            <Switch
              id={`sim${slot}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>SIM {slot} {language === 'so' ? 'Shirkadda' : 'Provider'}</Label>
          <Select value={provider || 'none'} onValueChange={(val) => setProvider(val === 'none' ? '' : val)} disabled={loading}>
            <SelectTrigger>
              <SelectValue placeholder={language === 'so' ? 'Dooro Shirkadda' : 'Select Provider'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{language === 'so' ? 'Waxba' : 'None'}</SelectItem>
              {PROVIDERS.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`sim${slot}-priority`}>
            {language === 'so' ? 'Priority / Lambarka Safka (1–5)' : 'Priority / Queue Number (1–5)'}
          </Label>
          <Input
            id={`sim${slot}-priority`}
            type="number"
            min={1}
            max={5}
            step={1}
            value={priority}
            onChange={(e) => setPriority(clampPriority(Number(e.target.value)))}
            disabled={loading}
          />
          <p className="text-[11px] text-muted-foreground">
            {language === 'so' ? '1 = kan ugu horreeya. 2–5 waxay sugayaan inta priority ka hooseeya uu bannaan yahay.' : '1 = first choice. 2–5 wait while a lower-number priority SIM is free.'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{language === 'so' ? 'Wax ka Badal Device-ka' : 'Edit Device'}</DialogTitle>
          <DialogDescription>
            {language === 'so'
              ? 'Waxaad beddeli kartaa magaca, SIM-yada iyo kala hormarintooda.'
              : 'Change the device name, SIMs and their delivery priority.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">{language === 'so' ? 'Magaca Device-ka' : 'Device Name'}</Label>
            <Input id="device-name" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} disabled={loading} />
          </div>

          <div className="space-y-2">
            <Label>{language === 'so' ? 'SIM 1 Lambar' : 'SIM 1 Number'}</Label>
            <Input type="tel" inputMode="numeric" pattern="[0-9]*" value={simNumber} onChange={(e) => setSimNumber(e.target.value.replace(/\D/g, ''))} disabled={loading} />
          </div>
          <SimRoutingFields slot={1} />

          <div className="space-y-2">
            <Label>{language === 'so' ? 'SIM 2 Lambar' : 'SIM 2 Number'} ({language === 'so' ? 'Ikhtiyaari' : 'Optional'})</Label>
            <Input type="tel" inputMode="numeric" pattern="[0-9]*" value={sim2Number} onChange={(e) => setSim2Number(e.target.value.replace(/\D/g, ''))} disabled={loading} />
          </div>
          <SimRoutingFields slot={2} />

          <div className="space-y-2">
            <Label className="text-muted-foreground text-sm">Device ID</Label>
            <p className="text-sm font-mono bg-muted p-2 rounded">{device?.device_id}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === 'so' ? 'Kaydi' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
