import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SimDevice {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  provider_name: string;
  is_active: boolean;
}

interface EditSimDialogProps {
  sim: SimDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const PROVIDERS = ['Hormuud', 'Somnet', 'Somtel', 'Amtel', 'Somlink'];

export const EditSimDialog = ({ sim, open, onOpenChange, onSuccess }: EditSimDialogProps) => {
  const [deviceName, setDeviceName] = useState(sim?.device_name || '');
  const [simNumber, setSimNumber] = useState(sim?.sim_number || '');
  const [providerName, setProviderName] = useState(sim?.provider_name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sim) return;
    
    if (!deviceName || !simNumber || !providerName) {
      toast({
        title: "Error",
        description: "Please fill all fields",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("android_devices")
        .update({
          device_name: deviceName,
          sim_number: simNumber,
          provider_name: providerName,
        })
        .eq("id", sim.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "SIM updated successfully",
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit SIM Card</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="device-name">Device Name</Label>
            <Input
              id="device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g., SIM-Hormuud-1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sim-number">SIM Number</Label>
            <Input
              id="sim-number"
              value={simNumber}
              onChange={(e) => setSimNumber(e.target.value.replace(/\D/g, ''))}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="e.g., +252612345678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={providerName} onValueChange={setProviderName}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};