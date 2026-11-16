/** Safely extract the sanitized, persisted Somlink API receipt from delivery_queue. */
export interface SomlinkReceipt {
  code: number | null;
  message: string | null;
  dataPhone: string | null;
  paidAmount: number | null;
  balance: number | null;
  paymentRef: string | null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  return text ? text.slice(0, 160) : null;
}

/** A malformed/empty response stays visible in the legacy fallback, not as a fake success. */
export function parseSomlinkReceipt(raw: string | null | undefined): SomlinkReceipt | null {
  if (!raw?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
    const data = parsed as Record<string, unknown>;
    if (!['code', 'message', 'data_phone', 'payment_ref', 'paid_amount', 'balance', 'error'].some((key) => key in data)) {
      return null;
    }

    return {
      code: finiteNumber(data.code),
      message: safeString(data.message) ?? safeString(data.error),
      dataPhone: safeString(data.data_phone),
      paidAmount: finiteNumber(data.paid_amount),
      balance: finiteNumber(data.balance),
      paymentRef: safeString(data.payment_ref),
    };
  } catch {
    return null;
  }
}

export type SomlinkReceiptState = 'success' | 'failed' | 'pending' | 'inconsistent';

/** Always respect database delivery state; a code 200 by itself is NOT proof of delivery. */
export function somlinkReceiptState(
  queueStatus: string,
  receipt: SomlinkReceipt,
): SomlinkReceiptState {
  if (queueStatus === 'failed' || queueStatus === 'timeout') return 'failed';
  if (queueStatus !== 'completed') return 'pending';
  if (receipt.code !== null && receipt.code !== 200) return 'inconsistent';
  if (receipt.message && /(?:fail|error|rejected|invalid|unsuccessful)/i.test(receipt.message)) {
    return 'inconsistent';
  }
  return 'success';
}

export function somlinkMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}
