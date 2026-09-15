import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface SimDevice {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  sim2_number: string | null;
  provider_name: string;
  sim1_provider: string | null;
  sim2_provider: string | null;
  is_active: boolean;
}

interface EditSim2DialogProps {
  sim: SimDevice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const EditSim2Dialog = ({ sim, open, onOpenChange, onSuccess }: EditSim2DialogProps) => {
  const { language } = useLanguage();
  const [sim2Number, setSim2Number] = useState(sim?.sim2_number || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sim) {
      setSim2Number(sim.sim2_number || '');
    }
  }, [sim]);

  const handleSave = async () => {
    if (!sim2Number.trim()) {
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: language === 'so' ? 'Fadlan geli lambarka SIM 2' : 'Please enter SIM 2 number',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('android_devices')
        .update({ sim2_number: sim2Number.trim() })
        .eq('id', sim.id);

      if (error) throw error;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' ? 'SIM 2 lambarka waa la cusboonaysiiyay' : 'SIM 2 number updated successfully',
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error updating SIM 2 number:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message || (language === 'so' ? 'Wax qalad ah ayaa dhacay' : 'Something went wrong'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>
            {language === 'so' ? 'Wax ka Badal SIM 2' : 'Edit SIM 2'}: {sim?.sim2_provider}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sim2-number">
              {language === 'so' ? 'SIM 2 Lambarka' : 'SIM 2 Number'}
            </Label>
            <Input
              id="sim2-number"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={sim2Number}
              onChange={(e) => setSim2Number(e.target.value.replace(/\D/g, ''))}
              placeholder={language === 'so' ? 'Tusaale: 612345678' : 'e.g., 612345678'}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{language === 'so' ? 'Provider' : 'Provider'}:</span>{' '}
            {sim?.sim2_provider}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {language === 'so' ? 'Ka noqo' : 'Cancel'}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'so' ? 'Kaydi' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
