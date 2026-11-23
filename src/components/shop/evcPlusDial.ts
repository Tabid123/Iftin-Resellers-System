/**
 * EVC Plus person-to-person dial shortcut documented for Hormuud 61/77 lines.
 * Never initiate payment here: the customer must still dial and enter their own PIN.
 * Merchant shortcodes are deliberately excluded because they use different flows.
 */
export function evcPlusDialCode(provider: string, phone: string, amount: number): string | null {
  if (!/evc\s*\+?|evc\s*plus|hormuud/i.test(provider)) return null;
  let digits = String(phone ?? "").replace(/[\s()+-]/g, "");
  if (/^252(61|77)\d{7}$/.test(digits)) digits = digits.slice(3);
  if (/^0(61|77)\d{7}$/.test(digits)) digits = digits.slice(1);
  if (!/^(61|77)\d{7}$/.test(digits)) return null;
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;

  // EVC accepts whole-dollar amounts without trailing decimal zeros.
  // Keep only meaningful decimal digits for amounts such as $6.50 / $6.25.
  const dollars = (cents / 100).toFixed(2).replace(/\.?0+$/, "");
  return `*712*${digits}*${dollars}#`;
}

export function evcPlusDialHref(code: string): string {
  // '#' must be escaped in a tel: URI, otherwise it becomes a fragment.
  return `tel:${code.replace(/#$/, "%23")}`;
}
