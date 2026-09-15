import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface SimDevice {
  id: string;
  device_name: string;
}

interface DeleteSimDialogProps {
  sim: SimDevice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const DeleteSimDialog = ({ sim, open, onOpenChange, onSuccess }: DeleteSimDialogProps) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!sim) return;

    setDeleting(true);
    try {
      // Archive instead of hard delete
      const { error } = await supabase
        .from("android_devices")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", sim.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "SIM archived successfully",
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
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This will archive "{sim?.device_name}". The SIM and its historical data will be preserved but hidden from the active list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive hover:bg-destructive/90">
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archive SIM
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};