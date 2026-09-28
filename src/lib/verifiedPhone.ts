const VERIFIED_PHONE_KEY = 'verifiedPhone';
const VERIFIED_PHONE_SESSION_KEY = 'iftin:verifiedPhone';
const LOGGED_OUT_SESSION_KEY = 'iftin:loggedOut';

export const SOMALI_PHONE_RE = /^(61|77|62|68|71|64)\d{7}$/;

export function normalizeVerifiedPhone(value: string | null | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  const local = digits.startsWith('252') ? digits.slice(3) : digits;
  return SOMALI_PHONE_RE.test(local) ? local : null;
}

export function saveVerifiedPhone(phone: string): string | null {
  const normalized = normalizeVerifiedPhone(phone);
  if (!normalized || typeof window === 'undefined') return normalized;

  try { localStorage.setItem(VERIFIED_PHONE_KEY, normalized); } catch {}
  try {
    sessionStorage.setItem(VERIFIED_PHONE_SESSION_KEY, normalized);
    sessionStorage.removeItem(LOGGED_OUT_SESSION_KEY);
  } catch {}
  return normalized;
}

export function readVerifiedPhone(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    if (sessionStorage.getItem(LOGGED_OUT_SESSION_KEY) === '1') return null;
  } catch {}

  let local: string | null = null;
  let session: string | null = null;
  try { local = localStorage.getItem(VERIFIED_PHONE_KEY); } catch {}
  try { session = sessionStorage.getItem(VERIFIED_PHONE_SESSION_KEY); } catch {}

  const normalized = normalizeVerifiedPhone(local) || normalizeVerifiedPhone(session);
  if (normalized) {
    try {
      if (local !== normalized) localStorage.setItem(VERIFIED_PHONE_KEY, normalized);
    } catch {}
    try {
      if (session !== normalized) sessionStorage.setItem(VERIFIED_PHONE_SESSION_KEY, normalized);
    } catch {}
  }
  return normalized;
}


export function clearVerifiedPhone(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(VERIFIED_PHONE_KEY); } catch {}
  try {
    sessionStorage.removeItem(VERIFIED_PHONE_SESSION_KEY);
    sessionStorage.setItem(LOGGED_OUT_SESSION_KEY, '1');
  } catch {}
}
