import { useState } from 'react';
import { CheckCircle, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase, getTenantId } from '@/integrations/supabase/client';

export const CompleteOrderPrompt = ({ order, isSo, onClose, onDone }: {
  order: any;
  isSo: boolean;
  onClose: () => void;
  onDone?: () => void;
}) => {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const cleanReason = reason.trim();
    if (!cleanReason) {
      toast.error(isSo ? 'Fadlan geli sababta xaqiijinta' : 'Please enter the confirmation reason');
      return;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      toast.error(isSo ? 'Tenant-ka lama helin' : 'Tenant not found');
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const note = `Admin manually confirmed delivered: ${cleanReason}`;

    try {
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          delivery_status: 'delivered',
          delivered_at: now,
          delivery_notes: note,
        })
        .eq('id', order.id)
        .eq('tenant_id', tenantId)
        .in('delivery_status', ['awaiting_sms', 'verification_required']);

      if (orderError) throw orderError;

      const { error: queueError } = await supabase
        .from('delivery_queue')
        .update({
          status: 'completed',
          completed_at: now,
          last_attempt_at: now,
          error_message: note,
        })
        .eq('order_id', order.id)
        .eq('tenant_id', tenantId)
        .in('status', ['awaiting_sms', 'verification_required']);

      if (queueError) throw queueError;

      toast.success(isSo ? 'Dalabka Delivered ayaa laga dhigay' : 'Order marked as delivered');
      onDone?.();
      onClose();
    } catch (error: any) {
      console.error('[CompleteOrderPrompt] confirmation failed', error);
      toast.error(error?.message || (isSo ? 'Xaqiijinta way fashilantay' : 'Confirmation failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative w-full max-w-[380px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 space-y-3"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-white">
            <CheckCircle className="w-4 h-4 text-green-600" />
            {isSo ? 'Xaqiiji dalabka' : 'Confirm delivery'}
          </div>
          <button onClick={onClose} disabled={saving} className="p-1 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-2.5 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
          <div className="font-semibold text-gray-800 dark:text-white">{order?.package_name}</div>
          <div>+252{String(order?.receiver_phone || '')}</div>
          <div className="text-[10px] uppercase font-bold text-amber-600">{order?.delivery_status}</div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-gray-500 font-medium">
            {isSo ? 'Sababta loo xaqiijiyay' : 'Reason for confirmation'}
          </label>
          <textarea
            autoFocus
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            placeholder={isSo ? 'Tusaale: SMS-ka shirkadda ayaan hubiyay...' : 'Example: Confirmed from carrier SMS...'}
            className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-semibold"
          >
            {isSo ? 'Ka noqo' : 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !reason.trim()}
            className="flex-1 py-2.5 rounded-xl bg-green-600 disabled:opacity-40 text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
