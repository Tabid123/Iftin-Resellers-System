import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw, Send, X } from 'lucide-react';
import { resendOrder, digits9 } from '@/lib/resendOrder';

/**
 * Dib u dirista dalab: lambarka waa la beddeli karaa, kadibna waxaa la
 * muujiyaa xaqiijin (confirmation) ka hor inta aan dalabka dib loo dirin.
 */
export const ResendOrderPrompt = ({ order, isSo, onClose, onDone }: {
  order: any;
  isSo: boolean;
  onClose: () => void;
  onDone?: () => void;
}) => {
  const [phone, setPhone] = useState(digits9(order?.receiver_phone ?? ''));
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { setPhone(digits9(order?.receiver_phone ?? '')); }, [order?.receiver_phone]);

  const valid = phone.length === 9;

  const handleSend = async () => {
    setSending(true);
    const res = await resendOrder(order, phone);
    setSending(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success(isSo ? 'Dalabka dib waa loo diray' : 'Order resent');
    onDone?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div className="relative w-full max-w-[360px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-white">
            <RotateCcw className="w-4 h-4 text-purple-500" />
            {isSo ? 'Dib u dir dalabka' : 'Resend order'}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 p-2.5 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
          <div className="font-semibold text-gray-800 dark:text-white">{order?.package_name}</div>
          <div>{order?.data_amount || '—'} · ${Number(order?.selling_price ?? 0).toFixed(2)}</div>
        </div>

        {!confirming ? (
          <>
            <div className="space-y-1">
              <div className="text-[11px] text-gray-500 font-medium">{isSo ? 'Lambarka qaataha' : 'Receiver number'}</div>
              <input
                type="tel" inputMode="numeric" value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="61xxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm font-mono outline-none"
              />
            </div>
            <button
              disabled={!valid}
              onClick={() => setConfirming(true)}
              className="w-full py-2.5 rounded-xl bg-purple-600 disabled:opacity-40 text-white text-sm font-bold active:scale-[0.98]"
            >
              {isSo ? 'Sii wad' : 'Continue'}
            </button>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 p-3 text-xs text-amber-800 dark:text-amber-200">
              {isSo
                ? `Ma hubtaa inaad dib u dirto "${order?.package_name}" oo aad u dirto +252${phone}?`
                : `Resend "${order?.package_name}" to +252${phone}?`}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-semibold">
                {isSo ? 'Dib u noqo' : 'Back'}
              </button>
              <button onClick={handleSend} disabled={sending}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
