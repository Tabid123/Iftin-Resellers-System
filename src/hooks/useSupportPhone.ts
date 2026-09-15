import { useTenant } from '@/contexts/TenantContext';

const DEFAULT_SUPPORT_PHONE = '615555495';

/** Normalise to a bare 9-digit Somali number (no +252 / 252 prefix). */
export function normalizeSupportPhone(raw?: string | null): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return DEFAULT_SUPPORT_PHONE;
  const local = digits.startsWith('252') ? digits.slice(3) : digits;
  return local.length >= 7 ? local : DEFAULT_SUPPORT_PHONE;
}

/** Tenant-specific customer support number with tel:/WhatsApp links. */
export function useSupportPhone() {
  const state = useTenant();
  const phone = normalizeSupportPhone(state.tenant?.support_phone ?? null);
  return {
    phone,
    display: `+252${phone}`,
    telHref: `tel:+252${phone}`,
    whatsappHref: `https://wa.me/252${phone}`,
  };
}

export { DEFAULT_SUPPORT_PHONE };
