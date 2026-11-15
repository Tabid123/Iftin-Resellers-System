/**
 * Carrier-confirmed Somtel gift delivery. A successful USSD/receipt must
 * explicitly mention the intended receiver. "MMI complete" and generic
 * "OK" do not qualify. This deliberately does not infer that subsequent
 * resend attempts also delivered the bundle.
 */
export function isSomtelConfirmedGiftReceipt(
  response: unknown,
  intendedReceiver: unknown,
): boolean {
  const text = String(response ?? '');
  const digits9 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-9);
  const receiver = digits9(intendedReceiver);
  if (!/^6\d{8}$/.test(receiver)) return false;
  if (!/\bku guul(?:ey|ay)satay\b/i.test(text)) return false;
  if (!/\b(?:ugu shubto|ugu shubtay)\b/i.test(text)) return false;
  const matches = text.match(/(?:\+?252[\s-]*)?6(?:[\s-]*\d){8}/g) ?? [];
  return matches.some(match => digits9(match) === receiver);
}
