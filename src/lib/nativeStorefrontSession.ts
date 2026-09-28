type NativeStorefrontSessionBridge = {
  get?: (key: string) => string;
  set?: (key: string, value: string) => void;
  remove?: (key: string) => void;
};

function bridge(): NativeStorefrontSessionBridge | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).IftinNativeSession as NativeStorefrontSessionBridge | undefined) ?? null;
}

export function nativeSessionAvailable(): boolean {
  const b = bridge();
  return Boolean(b?.get && b?.set && b?.remove);
}

export function readNativeSession(key: string): string | null {
  try {
    const value = bridge()?.get?.(key);
    return value ? String(value) : null;
  } catch {
    return null;
  }
}

export function writeNativeSession(key: string, value: string): void {
  try { bridge()?.set?.(key, value); } catch {}
}

export function removeNativeSession(key: string): void {
  try { bridge()?.remove?.(key); } catch {}
}
