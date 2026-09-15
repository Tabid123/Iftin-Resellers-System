/**
 * Analytics / crash reporting shim.
 *
 * The native Firebase plugins were removed from the mobile build: each tenant
 * APK ships its own applicationId, and a single google-services.json cannot
 * match them, which made the app crash on launch. These no-ops keep every
 * call site working until per-tenant Firebase configs exist.
 */

export const initializeFirebase = async (): Promise<void> => {};

export const logScreenView = async (_screenName: string): Promise<void> => {};

export const logPurchase = async (
  _packageName: string,
  _price: number,
  _provider: string,
): Promise<void> => {};

export const logEvent = async (
  _name: string,
  _params?: Record<string, unknown>,
): Promise<void> => {};

export const recordError = async (_error: Error): Promise<void> => {};
