import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Loader2 } from 'lucide-react';

interface DeleteDeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: {
    id: string;
    device_name: string;
  } | null;
  onSuccess: () => void;
}

export const DeleteDeviceDialog = ({
  open,
  onOpenChange,
  device,
  onSuccess,
}: DeleteDeviceDialogProps) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!device) return;

    setLoading(true);
    try {
      // First delete related sim_balances
      await supabase
        .from('sim_balances')
        .delete()
        .eq('device_id', device.id);

      // Soft-delete: archive the device (avoids FK constraint issues with delivery_queue)
      const { error } = await supabase
        .from('android_devices')
        .update({ archived_at: new Date().toISOString(), is_active: false })
        .eq('id', device.id);

      if (error) throw error;

      toast({
        title: language === 'so' ? 'Guul' : 'Success',
        description: language === 'so' 
          ? 'Device-ka waa la tiray' 
          : 'Device deleted successfully',
      });
      
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error deleting device:', error);
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm mx-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language === 'so' ? 'Ma hubtaa?' : 'Are you sure?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {language === 'so' 
              ? `Device-ka "${device?.device_name}" waa la tiri doonaa oo database-ka ka baxayaa. Tallaabadan dib looma celin karo!`
              : `Device "${device?.device_name}" will be permanently deleted. This action cannot be undone!`
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>
            {language === 'so' ? 'Ka noqo' : 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete} 
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {language === 'so' ? 'Tir' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
