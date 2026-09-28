import {
  readNativeSession,
  removeNativeSession,
  writeNativeSession,
} from '@/lib/nativeStorefrontSession';

const KEYS = {
  sender: 'offlineSenderPhone',
  receiver: 'offlineReceiverPhone',
  skipped: 'hasSkippedOfflineRegistration',
} as const;

function readLocal(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, value); } catch {}
}

function removeLocal(key: string) {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch {}
}

export function readStorefrontSessionValue(key: string): string | null {
  const nativeValue = readNativeSession(key);
  if (nativeValue) return nativeValue;

  const localValue = readLocal(key);
  if (localValue) {
    writeNativeSession(key, localValue);
    return localValue;
  }
  return null;
}

export function writeStorefrontSessionValue(key: string, value: string): void {
  writeLocal(key, value);
  writeNativeSession(key, value);
}

export function removeStorefrontSessionValue(key: string): void {
  removeLocal(key);
  removeNativeSession(key);
}

export function hasOfflineRegistrationSession(): boolean {
  if (readStorefrontSessionValue(KEYS.skipped) === 'true') return true;
  const sender = readStorefrontSessionValue(KEYS.sender);
  const receiver = readStorefrontSessionValue(KEYS.receiver);
  return Boolean(sender && receiver && sender.length === 9 && receiver.length >= 7);
}

export function saveOfflineRegistrationSession(sender: string, receiver: string): void {
  writeStorefrontSessionValue(KEYS.sender, sender);
  writeStorefrontSessionValue(KEYS.receiver, receiver);
  removeStorefrontSessionValue(KEYS.skipped);
}

export function markOfflineRegistrationSkipped(): void {
  writeStorefrontSessionValue(KEYS.skipped, 'true');
}

export function clearOfflineRegistrationSession(): void {
  removeStorefrontSessionValue(KEYS.sender);
  removeStorefrontSessionValue(KEYS.receiver);
  removeStorefrontSessionValue(KEYS.skipped);
}
