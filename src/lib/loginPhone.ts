/**
 * Customer login / phone verification prefix allowlist.
 * Do NOT reuse for USSD receivers or wallet payment validation:
 * those operations have separate network-specific restrictions.
 */
export const LOGIN_PHONE_PREFIXES = [
  '61', '77', '62', '68', '71', '64', '63', '90', '65',
] as const;

export const LOGIN_PHONE_RE = new RegExp(
  `^(?:${LOGIN_PHONE_PREFIXES.join('|')})\\d{7}$`,
);

/** The login field receives 9 local digits, without the +252 country code. */
export function isValidLoginPhone(phone: string): boolean {
  return LOGIN_PHONE_RE.test(phone);
}

export const LOGIN_PREFIX_HELP = LOGIN_PHONE_PREFIXES.join(', ');
