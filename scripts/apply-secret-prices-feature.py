from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {count}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Admin packages UI
# ---------------------------------------------------------------------------
config_path = Path('src/components/admin/simple/ConfigViews.tsx')
config = config_path.read_text()

config = replace_once(
    config,
    "import CachedImage from '@/components/CachedImage';\n",
    "import CachedImage from '@/components/CachedImage';\nimport { findPriceConflicts, parseSecretPrices, secretPricesOf } from '@/lib/secretPrices';\n",
    'ConfigViews import',
)

old_state = "  const [newPkg, setNewPkg] = useState({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' });"
new_state = "  const [newPkg, setNewPkg] = useState({ package_name: '', data_amount: '', selling_price: '', secret_prices: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' });"
if new_state not in config:
    state_count = config.count(old_state)
    if state_count != 1:
        raise SystemExit(f'ConfigViews package state: expected one anchor, found {state_count}')
    config = config.replace(old_state, new_state, 1)

old_save = """  const savePackage = async () => {
    if (!newPkg.package_name || !newPkg.selling_price || !newPkg.provider_id) { toast.error(isSo ? 'Buuxi meelaha lagama maarmaanka ah' : 'Fill required fields'); return; }
    const ussdCheck = validateUssdTemplate(newPkg.ussd_code || '');
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }
    const payload = {
      package_name: newPkg.package_name, data_amount: newPkg.data_amount, selling_price: Number(newPkg.selling_price),
      cost_price: Number(newPkg.cost_price || 0), validity_days: newPkg.validity_days, provider_id: newPkg.provider_id,
      category_id: newPkg.category_id || null, ussd_code: newPkg.ussd_code || null, connection_type_label: newPkg.connection_type_label,
    };
"""
new_save = """  const savePackage = async () => {
    if (!newPkg.package_name || !newPkg.selling_price || !newPkg.provider_id) { toast.error(isSo ? 'Buuxi meelaha lagama maarmaanka ah' : 'Fill required fields'); return; }
    const ussdCheck = validateUssdTemplate(newPkg.ussd_code || '');
    if (!ussdCheck.valid) { toast.error(ussdCheck.error); return; }

    const sellingPrice = Number(newPkg.selling_price);
    const secretPrices = parseSecretPrices(newPkg.secret_prices);
    try {
      const conflicts = await findPriceConflicts(newPkg.provider_id, sellingPrice, secretPrices, editingId);
      if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map((item) => item.package_name))];
        const warning = isSo
          ? `⚠️ Qiimaha wuxuu isku dhacayaa package-yadan:\n\n${names.map((name) => `• ${name}`).join('\\n')}\n\nMa sii waddaa kaydinta?`
          : `⚠️ Price conflict with these packages:\n\n${names.map((name) => `• ${name}`).join('\\n')}\n\nSave anyway?`;
        if (!window.confirm(warning)) return;
      }
    } catch (error: any) {
      toast.error((isSo ? 'Qiimaha gaar ah lama hubin karin: ' : 'Could not check secret price conflicts: ') + (error?.message || 'Unknown error'));
      return;
    }

    const payload = {
      package_name: newPkg.package_name, data_amount: newPkg.data_amount, selling_price: sellingPrice,
      secret_prices: secretPrices,
      cost_price: Number(newPkg.cost_price || 0), validity_days: newPkg.validity_days, provider_id: newPkg.provider_id,
      category_id: newPkg.category_id || null, ussd_code: newPkg.ussd_code || null, connection_type_label: newPkg.connection_type_label,
    };
"""
config = replace_once(config, old_save, new_save, 'ConfigViews savePackage')

old_reset = "    setNewPkg({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' });"
new_reset = "    setNewPkg({ package_name: '', data_amount: '', selling_price: '', secret_prices: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' });"
if new_reset not in config:
    reset_count = config.count(old_reset)
    if reset_count != 1:
        raise SystemExit(f'ConfigViews post-save reset: expected one anchor, found {reset_count}')
    config = config.replace(old_reset, new_reset, 1)

old_edit = """      package_name: item.package_name || '', data_amount: item.data_amount || '', selling_price: String(item.selling_price || ''),
      cost_price: String(item.cost_price || ''), validity_days: item.validity_days || '30', provider_id: item.provider_id || '',
"""
new_edit = """      package_name: item.package_name || '', data_amount: item.data_amount || '', selling_price: String(item.selling_price || ''),
      secret_prices: secretPricesOf(item).join(', '),
      cost_price: String(item.cost_price || ''), validity_days: item.validity_days || '30', provider_id: item.provider_id || '',
"""
config = replace_once(config, old_edit, new_edit, 'ConfigViews edit secret prices')

old_add_reset = "      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewPkg({ package_name: '', data_amount: '', selling_price: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' }); }}"
new_add_reset = "      <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setNewPkg({ package_name: '', data_amount: '', selling_price: '', secret_prices: '', cost_price: '', validity_days: '30', provider_id: '', category_id: '', ussd_code: '', connection_type_label: 'Data' }); }}"
config = replace_once(config, old_add_reset, new_add_reset, 'ConfigViews add reset')

old_prices = """          <div className=\"grid grid-cols-2 gap-2\">
            <input value={newPkg.selling_price} onChange={e => setNewPkg(p => ({...p, selling_price: e.target.value}))} placeholder=\"Sell Price *\" type=\"number\" inputMode=\"decimal\" className=\"px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none\" />
            <input value={newPkg.cost_price} onChange={e => setNewPkg(p => ({...p, cost_price: e.target.value}))} placeholder=\"Cost Price\" type=\"number\" inputMode=\"decimal\" className=\"px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none\" />
          </div>
"""
new_prices = """          <div className=\"grid grid-cols-2 gap-2\">
            <input value={newPkg.selling_price} onChange={e => setNewPkg(p => ({...p, selling_price: e.target.value}))} placeholder=\"Sell Price *\" type=\"number\" inputMode=\"decimal\" className=\"px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none\" />
            <input value={newPkg.cost_price} onChange={e => setNewPkg(p => ({...p, cost_price: e.target.value}))} placeholder=\"Cost Price\" type=\"number\" inputMode=\"decimal\" className=\"px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700 border text-sm outline-none\" />
          </div>
          <label className=\"block space-y-1\">
            <span className=\"text-xs font-bold text-amber-700 dark:text-amber-400\">🔒 Qiimooyin Gaar ah (Only Me)</span>
            <input
              value={newPkg.secret_prices}
              onChange={e => setNewPkg(p => ({ ...p, secret_prices: e.target.value }))}
              placeholder=\"Tusaale: 0.31, 0.35, 0.4\"
              inputMode=\"decimal\"
              className=\"w-full px-3 py-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm outline-none\"
            />
          </label>
"""
config = replace_once(config, old_prices, new_prices, 'ConfigViews secret input')

old_card_price = """            <span className=\"font-bold text-sm text-purple-600\">${Number(item.selling_price).toFixed(2)}</span>
"""
new_card_price = """            <div className=\"text-right\">
              <div className=\"font-bold text-sm text-purple-600\">${Number(item.selling_price).toFixed(2)}</div>
              {secretPricesOf(item).length > 0 && (
                <div className=\"text-[9px] font-semibold text-amber-600 dark:text-amber-400\">🔒 {secretPricesOf(item).map((price) => `$${price}`).join(' · ')}</div>
              )}
            </div>
"""
config = replace_once(config, old_card_price, new_card_price, 'ConfigViews package card prices')

old_sell_row = """            { icon: DollarSign, label: isSo ? 'Iibka' : 'Sell Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
            { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: `$${Number(item.cost_price || 0).toFixed(2)}`, color: 'text-red-500' },
"""
new_sell_row = """            { icon: DollarSign, label: isSo ? 'Iibka' : 'Sell Price', value: `$${Number(item.selling_price).toFixed(2)}`, color: 'text-emerald-500' },
            ...(secretPricesOf(item).length > 0 ? [{ icon: DollarSign, label: '🔒 Qiimooyin Gaar ah', value: secretPricesOf(item).map((price) => `$${price}`).join(', '), color: 'text-amber-600' }] : []),
            { icon: DollarSign, label: isSo ? 'Kharash' : 'Cost', value: `$${Number(item.cost_price || 0).toFixed(2)}`, color: 'text-red-500' },
"""
config = replace_once(config, old_sell_row, new_sell_row, 'ConfigViews expanded secret prices')

config_path.write_text(config)


# ---------------------------------------------------------------------------
# Generated Supabase TypeScript types
# ---------------------------------------------------------------------------
types_path = Path('src/integrations/supabase/types.ts')
types = types_path.read_text()
start_marker = '      data_packages_config: {'
end_marker = '      delivery_instructions: {'
start = types.find(start_marker)
end = types.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('Supabase types: data_packages_config section not found')
section = types[start:end]
if 'secret_prices:' not in section:
    row_insert_anchor = '          selling_price: number\n'
    if section.count(row_insert_anchor) != 2:
        raise SystemExit(f'Supabase types: expected 2 required selling_price anchors, found {section.count(row_insert_anchor)}')
    section = section.replace(row_insert_anchor, '          secret_prices: number[]\n          selling_price: number\n', 2)
    update_anchor = '          selling_price?: number\n'
    if section.count(update_anchor) != 1:
        raise SystemExit(f'Supabase types: expected 1 optional selling_price anchor, found {section.count(update_anchor)}')
    section = section.replace(update_anchor, '          secret_prices?: number[]\n          selling_price?: number\n', 1)
    types = types[:start] + section + types[end:]
types_path.write_text(types)


# ---------------------------------------------------------------------------
# Payment receipt matching (tenant-scoped client already wraps these queries)
# ---------------------------------------------------------------------------
edge_path = Path('supabase/functions/process-payment-receipt/index.ts')
edge = edge_path.read_text()

# Auto top-up mapped-package path: if public/custom amount did not match, try the
# same mapped package name via data_packages_config.secret_prices.
old_mapped = """          const matchedPkg = matchedMapping ? (mappedPkgs || []).find((p: any) => p.id === matchedMapping.package_id) : null;
          if (matchedPkg) {
            customPkg = matchedPkg;
            console.log(`✅ Multi-mapping match: amount $${amount} == ${matchedPkg.package_name} (custom: ${matchedMapping.custom_amount || 'none'}, selling: $${matchedPkg.selling_price})`);
          } else {
"""
new_mapped = """          let matchedPkg = matchedMapping ? (mappedPkgs || []).find((p: any) => p.id === matchedMapping.package_id) : null;
          if (!matchedPkg) {
            const mappedNames = [...new Set((mappedPkgs || []).map((p: any) => p.package_name).filter(Boolean))];
            if (mappedNames.length > 0) {
              const { data: secretMappedPkg } = await supabase
                .from('data_packages_config')
                .select('*')
                .eq('provider_id', detectedProvider.id)
                .in('package_name', mappedNames)
                .contains('secret_prices', [Number(amount)])
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
              if (secretMappedPkg) {
                matchedPkg = (mappedPkgs || []).find((p: any) => p.package_name === secretMappedPkg.package_name) || secretMappedPkg;
              }
            }
          }
          if (matchedPkg) {
            customPkg = matchedPkg;
            console.log(`✅ Multi-mapping match: amount $${amount} == ${matchedPkg.package_name} (custom: ${matchedMapping?.custom_amount || 'secret/public'}, selling: $${matchedPkg.selling_price})`);
          } else {
"""
edge = replace_once(edge, old_mapped, new_mapped, 'process-payment auto topup mapped secret')

old_no_mapping_end = """          customPkg = fallbackPkgs && fallbackPkgs.length > 0 ? fallbackPkgs[0] : null;
        }
      }

      if (!customPkg) {
"""
new_no_mapping_end = """          customPkg = fallbackPkgs && fallbackPkgs.length > 0 ? fallbackPkgs[0] : null;
        }

        if (!customPkg) {
          const { data: secretRealPkg } = await supabase
            .from('data_packages_config')
            .select('*')
            .eq('provider_id', detectedProvider.id)
            .contains('secret_prices', [Number(amount)])
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (secretRealPkg) {
            const { data: matchingAutoPkg } = await supabase
              .from('auto_topup_packages')
              .select('*')
              .eq('topup_number_id', autoTopupRecord.id)
              .eq('package_name', secretRealPkg.package_name)
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();
            customPkg = matchingAutoPkg || secretRealPkg;
          }
        }
      }

      if (!customPkg) {
"""
edge = replace_once(edge, old_no_mapping_end, new_no_mapping_end, 'process-payment auto topup general secret')

old_pending = """    if (pendingOnline) {
      const expectedAmount = Number(pendingOnline.expected_amount);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(expectedAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
"""
new_pending = """    if (pendingOnline) {
      const expectedAmount = Number(pendingOnline.expected_amount);
      const smsAmount = Number(amount);
      let amountMatches = Math.abs(expectedAmount - smsAmount) < 0.01;

      if (!amountMatches && pendingOnline.package_id) {
        const { data: secretPackageMatch } = await supabase
          .from('data_packages_config')
          .select('id')
          .eq('id', pendingOnline.package_id)
          .eq('provider_id', pendingOnline.provider_id)
          .contains('secret_prices', [smsAmount])
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        amountMatches = !!secretPackageMatch;
        if (amountMatches) console.log('🔒 Pending online payment matched package secret price:', smsAmount);
      }
      
      if (amountMatches) {
"""
edge = replace_once(edge, old_pending, new_pending, 'process-payment pending online secret')

old_legacy = """    if (pendingOrder) {
      const orderAmount = Number(pendingOrder.selling_price);
      const smsAmount = Number(amount);
      const amountMatches = Math.abs(orderAmount - smsAmount) < 0.01;
      
      if (amountMatches) {
"""
new_legacy = """    if (pendingOrder) {
      const orderAmount = Number(pendingOrder.selling_price);
      const smsAmount = Number(amount);
      let amountMatches = Math.abs(orderAmount - smsAmount) < 0.01;

      if (!amountMatches && pendingOrder.package_id) {
        const { data: secretPackageMatch } = await supabase
          .from('data_packages_config')
          .select('id')
          .eq('id', pendingOrder.package_id)
          .eq('provider_id', pendingOrder.provider_id)
          .contains('secret_prices', [smsAmount])
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        amountMatches = !!secretPackageMatch;
        if (amountMatches) console.log('🔒 Legacy online order matched package secret price:', smsAmount);
      }
      
      if (amountMatches) {
"""
edge = replace_once(edge, old_legacy, new_legacy, 'process-payment legacy online secret')

old_offline = """    let { data: packages } = await supabase
      .from('data_packages_config')
      .select('*')
      .eq('provider_id', registration.provider_id)
      .eq('selling_price', price)
      .eq('is_active', true);

    if (!packages || packages.length === 0) {
      const rangeRes = await supabase
"""
new_offline = """    let { data: packages } = await supabase
      .from('data_packages_config')
      .select('*')
      .eq('provider_id', registration.provider_id)
      .eq('selling_price', price)
      .eq('is_active', true)
      .limit(1);

    if (!packages || packages.length === 0) {
      const { data: secretPackageMatch } = await supabase
        .from('data_packages_config')
        .select('*')
        .eq('provider_id', registration.provider_id)
        .contains('secret_prices', [price])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      packages = secretPackageMatch ? [secretPackageMatch] : [];
      if (secretPackageMatch) console.log('🔒 Offline registration matched package secret price:', price, secretPackageMatch.package_name);
    }

    if (!packages || packages.length === 0) {
      const rangeRes = await supabase
"""
edge = replace_once(edge, old_offline, new_offline, 'process-payment offline secret')

edge_path.write_text(edge)

print('Secret prices feature patches applied successfully.')
