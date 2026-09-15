/**
 * Diiwaangelinta offline-ka.
 *
 * Tenant-yada `api_partner` ah oo keliya ayaa Iftin Partner API loo diraa.
 * Tenant-yada Android APK-ga leh (delivery_mode = 'android_device') waxay
 * diiwaanka ku keydiyaan jadwalka maxalliga ah `offline_registrations`.
 */
import { supabase } from '@/integrations/supabase/client';
import { resolveTenantId } from '@/lib/iftinCatalog';
import {
  registerOfflineCustomer,
  normalizePhone,
  isValidOfflinePhone,
  type OfflineApiResult,
  type OfflineRegisterInput,
} from '@/lib/iftinOfflineApi';

const modeCache = new Map<string, 'api_partner' | 'android_device'>();

export async function getTenantDeliveryMode(tenantId: string): Promise<'api_partner' | 'android_device'> {
  const cached = modeCache.get(tenantId);
  if (cached) return cached;
  const { data } = await supabase.from('tenants').select('delivery_mode').eq('id', tenantId).maybeSingle();
  const mode = data?.delivery_mode === 'api_partner' ? 'api_partner' : 'android_device';
  modeCache.set(tenantId, mode);
  return mode;
}

/** Diiwaan geli macmiil offline ah — API ama maxalli, iyadoo ku xiran tenant-ka. */
export async function saveOfflineRegistration(input: OfflineRegisterInput): Promise<OfflineApiResult> {
  const sender_phone = normalizePhone(input.senderPhone);
  const receiver_phone = normalizePhone(input.receiverPhone);

  if (!isValidOfflinePhone(sender_phone)) {
    return { ok: false, status: 400, error: 'invalid_sender_phone', message: 'Lambarka lacagta diraya sax ma aha' };
  }
  if (!isValidOfflinePhone(receiver_phone)) {
    return { ok: false, status: 400, error: 'invalid_receiver_phone', message: 'Lambarka xirmada loo dirayo sax ma aha' };
  }

  const tenantId = input.tenantId ?? (await resolveTenantId());
  if (!tenantId) {
    return { ok: false, status: 400, error: 'missing_tenant', message: 'Tenant-ka lama aqoonsan' };
  }

  const mode = await getTenantDeliveryMode(tenantId);
  if (mode === 'api_partner') {
    return registerOfflineCustomer({ ...input, tenantId });
  }

  // provider_id waa lagama maarmaan si raadinta xirmadu u shaqeyso.
  let providerId = input.providerId ?? null;
  if (!providerId && input.providerName) {
    const { data: prov } = await supabase
      .from('providers_config')
      .select('id')
      .ilike('provider_name', input.providerName)
      .limit(1)
      .maybeSingle();
    providerId = prov?.id ?? null;
  }

  // Tenant-scoped upsert oo dhinaca database-ka lagu xannibay (ma jiro akhris toos ah).
  const { error } = await supabase.rpc('storefront_save_offline_registration', {
    p_sender: sender_phone,
    p_receiver: receiver_phone,
    p_provider_id: providerId,
    p_provider_name: input.providerName ?? null,
  });


  if (error) {
    return { ok: false, status: 400, error: 'local_insert_failed', message: error.message };
  }
  return { ok: true, status: 200, message: 'Waa la diiwaan geliyay', data: { local: true } };
}
