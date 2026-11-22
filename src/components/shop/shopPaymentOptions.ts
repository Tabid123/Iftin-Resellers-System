import { evcPlusDialCode, evcPlusDialHref } from "./evcPlusDial";
import { getAllowedPrefixes, matchesAllowedPrefix } from "@/lib/phonePrefixes";

export type ShopPaymentOption = {
  id: string;
  provider: string;
  number: string;
};

export function shopPaymentOptions(config: {
  payment_provider?: string | null;
  payment_number?: string | null;
  payment_methods?: unknown;
} | null): ShopPaymentOption[] {
  if (!config) return [];
  if (Array.isArray(config.payment_methods) && config.payment_methods.length > 0) {
    return config.payment_methods
      .filter((item): item is ShopPaymentOption =>
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        /^[a-zA-Z0-9_-]{1,72}$/.test(item.id) &&
        typeof item.provider === "string" &&
        item.provider.trim().length > 0 &&
        typeof item.number === "string" &&
        /^\+?[0-9]{7,15}$/.test(item.number))
      .slice(0, 8);
  }
  return config.payment_number
    ? [{ id: "legacy", provider: config.payment_provider || "EVC Plus", number: config.payment_number }]
    : [];
}

export function normalizedPayerPhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("252")) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function validPayerPhone(provider: string, value: string): boolean {
  const phone = normalizedPayerPhone(value);
  if (!/^\d{9}$/.test(phone)) return false;
  return matchesAllowedPrefix(phone, getAllowedPrefixes(provider));
}

export function shopMethodDialHref(provider: string, payee: string, amount: number): string | null {
  const evcCode = evcPlusDialCode(provider, payee, amount);
  if (evcCode) return evcPlusDialHref(evcCode);

  // Somtel's *101# opens the eDahab menu. Unlike EVC, this does not
  // prefill a recipient or amount. The customer must enter both manually.
  if (/e[\s-]*dahab|somtel/i.test(provider) && /^\+?[0-9]{7,15}$/.test(payee)) {
    return "tel:*101%23";
  }
  // Unknown provider USSD formats must not be fabricated.
  return null;
}
