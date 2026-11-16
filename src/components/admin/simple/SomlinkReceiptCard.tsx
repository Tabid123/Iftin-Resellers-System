import {
  AlertTriangle, CheckCircle2, ChevronDown, Clock3, Code2,
  Hash, Phone, ReceiptText, Wallet,
} from 'lucide-react';
import { formatPhone } from './shared';
import {
  parseSomlinkReceipt, somlinkMoney, somlinkReceiptState,
} from '@/lib/somlinkReceipt';

interface Props {
  rawResponse: string | null;
  ussdCode: string;
  status: string;
  receiverPhone: string;
  sellingPrice: number;
  canViewFinancial: boolean;
  isSo: boolean;
}

/** Merchant-friendly Somlink API receipt, without changing or resending any delivery. */
export function SomlinkReceiptCard({
  rawResponse, ussdCode, status, receiverPhone, sellingPrice,
  canViewFinancial, isSo,
}: Props) {
  const receipt = parseSomlinkReceipt(rawResponse);
  const state = receipt ? somlinkReceiptState(status, receipt) :
    status === 'completed' ? 'success' : status === 'failed' || status === 'timeout' ? 'failed' : 'pending';
  const isSuccess = state === 'success';
  const isFailed = state === 'failed' || state === 'inconsistent';
  const StatusIcon = isSuccess ? CheckCircle2 : isFailed ? AlertTriangle : Clock3;
  const resultText = isSuccess
    ? (isSo ? 'Xirmada waa la diray' : 'Bundle delivered')
    : isFailed
      ? (isSo ? 'Hubin ayaa loo baahan yahay' : 'Delivery needs attention')
      : (isSo ? 'Dalabku wuu socdaa' : 'Delivery in progress');
  const statusTone = isSuccess
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800'
    : isFailed
      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-300 dark:border-red-800'
      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800';
  const apiPhone = receipt?.dataPhone || receiverPhone;
  const priceDifference = canViewFinancial && receipt?.paidAmount != null &&
    Number.isFinite(sellingPrice) && Math.abs(receipt.paidAmount - sellingPrice) >= 0.005;
  const message = receipt?.message;
  const unknownMessage = message && message !== 'DATA_PAID_SUCCESSFULLY'
    ? message.replace(/_/g, ' ').trim()
    : null;
  const Row = ({ label, value, icon: Icon }: {
    label: string; value: string; icon: typeof Phone;
  }) => (
    <div className="min-w-0 rounded-lg border border-border/60 bg-background/80 p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" /> {label}
      </div>
      <div className="break-all text-xs font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );

  return (
    <section aria-label={isSo ? 'Natiijada Somlink' : 'Somlink delivery receipt'}
      className="mt-2 overflow-hidden rounded-xl border border-border/70 bg-muted/20 text-foreground">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/90 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
            <ReceiptText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold">Somlink API</p>
            <p className="text-[10px] text-muted-foreground">{isSo ? 'Rasiidka dirista xirmada' : 'Delivery receipt'}</p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone}`}>
          <StatusIcon className="h-3 w-3" /> {isSuccess ? (isSo ? 'Guul' : 'Success') : isFailed ? (isSo ? 'Fashil / Hubin' : 'Check') : (isSo ? 'Sugaya' : 'Pending')}
        </span>
      </div>

      <div className="space-y-2.5 p-3">
        <div className="flex items-center gap-2">
          <StatusIcon className={`h-4 w-4 shrink-0 ${isSuccess ? 'text-emerald-600' : isFailed ? 'text-red-600' : 'text-amber-600'}`} />
          <p className="text-xs font-semibold">{resultText}</p>
        </div>
        {unknownMessage && (
          <p className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5 text-[11px] break-words text-muted-foreground">
            {unknownMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Row icon={Phone} label={isSo ? 'Lambarka loo diray' : 'Recipient'} value={formatPhone(apiPhone)} />
          {receipt?.paymentRef && (
            <Row icon={Hash} label={isSo ? 'Tixraaca Somlink' : 'Somlink reference'} value={receipt.paymentRef} />
          )}
          {canViewFinancial && receipt?.paidAmount != null && (
            <Row icon={ReceiptText} label={isSo ? 'Somlink ka jaray' : 'Somlink charged'} value={somlinkMoney(receipt.paidAmount)} />
          )}
          {canViewFinancial && receipt?.balance != null && (
            <Row icon={Wallet} label={isSo ? 'Haraaga Somlink' : 'Somlink balance'} value={somlinkMoney(receipt.balance)} />
          )}
        </div>

        {priceDifference && receipt?.paidAmount != null && (
          <div role="note" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold">{isSo ? 'Qiimaha iibka iyo kan Somlink way kala duwan yihiin' : 'Sale price differs from Somlink charge'}</p>
              <p className="mt-0.5 text-[10px]">
                {isSo ? 'Iibka' : 'Sale'} {somlinkMoney(sellingPrice)} · Somlink {somlinkMoney(receipt.paidAmount)}
              </p>
            </div>
          </div>
        )}

        {rawResponse && (
          <details className="group rounded-lg border border-border/60 bg-background/80">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1.5"><Code2 className="h-3.5 w-3.5" /> {isSo ? 'Faahfaahinta farsamada' : 'Technical details'}</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-border/60 p-2.5">
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">USSD: {ussdCode}</p>
              {receipt?.code != null && <p className="mb-1 text-[10px] text-muted-foreground">API Code: {receipt.code}</p>}
              {canViewFinancial ? (
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-muted-foreground">{rawResponse}</pre>
              ) : (
                <p className="text-[10px] text-muted-foreground">{isSo ? 'Xogta API-ga oo dhammaystiran waxay u xiran tahay maamulka.' : 'Full API details are restricted.'}</p>
              )}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
