/**
 * Logos bundled inside the app build (also inside the APK), so a provider logo
 * always renders — online or fully offline — even with an empty image cache.
 */
import { getLocalImage } from '@/lib/localImages';

/** Returns a bundled logo for a provider/payment name, if we ship one. */
export function getBundledLogo(name: string | null | undefined): string | null {
  return getLocalImage('provider', name) ?? getLocalImage('payment', name);
}
