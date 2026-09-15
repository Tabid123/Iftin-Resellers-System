import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BalanceUpdateRequest {
  sim_number: string;
  provider_name: string;
  balance_type: 'evc_plus' | 'evoucher';
  balance: number;
  source?: 'sms' | 'ussd';
  sim_slot?: number; // Optional - will be auto-detected if not provided
  device_id?: string; // Hardware device id (android_devices.device_id) — used to resolve the tenant
}


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
      sim_number, 
      provider_name, 
      balance_type, 
      balance, 
      source = 'sms',
      sim_slot: requestedSimSlot,
      device_id: hardwareDeviceId
    }: BalanceUpdateRequest = await req.json();

    console.log('📱 Balance update received:', { 
      sim_number, 
      provider_name, 
      balance_type, 
      balance, 
      source,
      sim_slot: requestedSimSlot,
      device_id: hardwareDeviceId,
      timestamp: new Date().toISOString()
    });


    // Normalize balance_type (Android sends "evoucher" but we want consistency)
    const normalizedBalanceType = balance_type.toLowerCase().replace('-', '_') as 'evc_plus' | 'evoucher';

    // Validate balance_type
    if (!['evc_plus', 'evoucher'].includes(normalizedBalanceType)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid balance_type. Must be "evc_plus" or "evoucher"' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Normalize provider_name for matching (lowercase)
    const providerLower = provider_name.toLowerCase().trim();
    console.log('🔍 Normalized provider:', providerLower);

    // Get candidate devices — scoped to the reporting device when we know it
    let devicesQuery = supabase
      .from('android_devices')
      .select('id, device_id, tenant_id, sim_number, provider_name, sim1_provider, sim2_provider')
      .eq('is_active', true);

    if (hardwareDeviceId) {
      devicesQuery = devicesQuery.eq('device_id', hardwareDeviceId);
    }

    const { data: devices, error: devicesError } = await devicesQuery;

    if (devicesError) {
      console.error('❌ Devices lookup error:', devicesError);
      throw devicesError;
    }

    if (hardwareDeviceId && (!devices || devices.length === 0)) {
      console.log('❌ Reporting device not registered:', hardwareDeviceId);
      return new Response(
        JSON.stringify({ success: false, error: 'Device not registered', needsLogin: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }


    console.log('🔍 Found devices:', devices?.map(d => ({
      id: d.id,
      provider_name: d.provider_name,
      sim1_provider: d.sim1_provider,
      sim2_provider: d.sim2_provider
    })));

    // Provider patterns for smart matching (handles different naming conventions)
    const providerPatterns: { [key: string]: string[] } = {
      'hormuud': ['hormuud', 'evc', 'sahal', 'evcplus', 'evc-plus', 'evc plus'],
      'somtel': ['somtel', 'edahab', 'e-dahab', 'zaad'],
      'amtel': ['amtel', 'emaal', 'e-maal', 'mycash', 'premier', 'airtime', 'defaultaccount', 'mfsuser'],
      'somnet': ['somnet', 'telesom', 'golis']
    };

    // Smart provider matching function
    const matchesProvider = (configProvider: string, searchProvider: string): boolean => {
      const configLower = configProvider.toLowerCase().trim();
      const searchLower = searchProvider.toLowerCase().trim();
      
      // Direct match (existing logic)
      if (configLower.includes(searchLower) || searchLower.includes(configLower)) {
        return true;
      }
      
      // Pattern-based match - check if both belong to the same provider family
      for (const [canonical, patterns] of Object.entries(providerPatterns)) {
        const configMatchesCanonical = patterns.some(p => configLower.includes(p));
        const searchMatchesCanonical = patterns.some(p => searchLower.includes(p));
        if (configMatchesCanonical && searchMatchesCanonical) {
          console.log(`🔗 Pattern match: "${configProvider}" and "${searchProvider}" both match "${canonical}"`);
          return true;
        }
      }
      
      return false;
    };

    // Find matching device and determine sim_slot
    let device = null;
    let detectedSimSlot = 1; // Default to SIM 1

    for (const d of devices || []) {
      const sim1Provider = (d.sim1_provider || '').toLowerCase();
      const sim2Provider = (d.sim2_provider || '').toLowerCase();
      
      const matchesSim1 = matchesProvider(d.sim1_provider || '', provider_name);
      const matchesSim2 = matchesProvider(d.sim2_provider || '', provider_name);
      
      console.log('🔍 Checking device:', {
        device_id: d.id,
        sim1_provider: d.sim1_provider,
        sim2_provider: d.sim2_provider,
        searchTerm: providerLower,
        matchesSim1,
        matchesSim2
      });
      
      if (matchesSim1) {
        device = d;
        detectedSimSlot = 1;
        console.log('✅ Matched SIM 1 provider:', sim1Provider);
        break;
      } else if (matchesSim2) {
        device = d;
        detectedSimSlot = 2;
        console.log('✅ Matched SIM 2 provider:', sim2Provider);
        break;
      }
    }

    // If we know the reporting device, always use it even when provider matching failed
    if (!device && hardwareDeviceId && devices && devices.length > 0) {
      device = devices[0];
      console.log('ℹ️ Provider match failed — using reporting device:', device.id);
    }

    // Use requested sim_slot if provided, otherwise use detected
    const simSlot = requestedSimSlot || detectedSimSlot;

    console.log('🔍 Device search result:', { 
      provider_name, 
      providerLower, 
      found: !!device, 
      device_id: device?.id,
      detected_sim_slot: detectedSimSlot,
      final_sim_slot: simSlot
    });

    if (!device) {
      console.log('❌ No device found for:', { sim_number, provider_name, providerLower });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `No device found for provider ${provider_name}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const tenantId = (device as any).tenant_id as string | null;
    if (!tenantId) {
      console.log('❌ Device has no tenant:', device.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Device not registered to a tenant', needsLogin: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('✅ Device found:', device.id, 'SIM slot:', simSlot, 'tenant:', tenantId);

    // Check if balance record exists for this SIM + balance_type + sim_slot
    const { data: existingBalance, error: balanceError } = await supabase
      .from('sim_balances')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('device_id', device.id)
      .eq('balance_type', normalizedBalanceType)
      .eq('sim_slot', simSlot)
      .maybeSingle();


    if (balanceError && balanceError.code !== 'PGRST116') {
      console.error('❌ Balance lookup error:', balanceError);
      throw balanceError;
    }

    console.log('🔍 Existing balance check:', { 
      exists: !!existingBalance, 
      id: existingBalance?.id,
      device_id: device.id,
      balance_type: normalizedBalanceType,
      sim_slot: simSlot
    });

    let result;

    if (existingBalance) {
      // Update existing balance
      console.log('📝 Updating existing balance record:', existingBalance.id);
      const { data, error } = await supabase
        .from('sim_balances')
        .update({
          balance,
          last_updated: new Date().toISOString(),
        })
        .eq('id', existingBalance.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log('✅ Balance updated:', result);
    } else {
      // Create new balance record
      console.log('📝 Creating new balance record for sim_slot:', simSlot);
      const { data, error } = await supabase
        .from('sim_balances')
        .insert({
          tenant_id: tenantId,
          device_id: device.id,
          balance,
          balance_type: normalizedBalanceType,
          sim_slot: simSlot,
          balance_source: source === 'ussd' ? 'ussd' : 'sms',
        })
        .select()
        .single();

      if (error) {
        // Handle duplicate key error - try to update instead
        if (error.code === '23505') {
          console.log('⚠️ Duplicate key detected, falling back to update');
          
          // Find the existing record and update it
          const { data: existingRecord } = await supabase
            .from('sim_balances')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('device_id', device.id)
            .eq('balance_type', normalizedBalanceType)
            .eq('sim_slot', simSlot)
            .single();
          
          if (existingRecord) {
            const { data: updateData, error: updateError } = await supabase
              .from('sim_balances')
              .update({
                balance,
                last_updated: new Date().toISOString(),
              })
              .eq('id', existingRecord.id)
              .select()
              .single();
            
            if (updateError) throw updateError;
            result = updateData;
            console.log('✅ Balance updated (fallback):', result);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      } else {
        result = data;
        console.log('✅ Balance created:', result);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${normalizedBalanceType} balance updated to ${balance}`,
        balance_id: result.id,
        device_id: device.id,
        sim_slot: simSlot,
        balance_type: normalizedBalanceType,
        balance
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Error updating balance:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
