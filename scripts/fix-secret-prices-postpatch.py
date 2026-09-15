from pathlib import Path

# DB default makes secret_prices optional on inserts, but required on returned rows.
types_path = Path('src/integrations/supabase/types.ts')
types = types_path.read_text()
start = types.find('      data_packages_config: {')
end = types.find('      delivery_instructions: {', start)
if start < 0 or end < 0:
    raise SystemExit('data_packages_config type section not found')
section = types[start:end]
insert_start = section.find('        Insert: {')
update_start = section.find('        Update: {', insert_start)
if insert_start < 0 or update_start < 0:
    raise SystemExit('data_packages_config Insert/Update type blocks not found')
insert_block = section[insert_start:update_start]
insert_block = insert_block.replace('          secret_prices: number[]\n', '          secret_prices?: number[]\n', 1)
section = section[:insert_start] + insert_block + section[update_start:]
types = types[:start] + section + types[end:]
types_path.write_text(types)

# Keep the matching-path maybeSingle guard consistent with the feature requirement.
edge_path = Path('supabase/functions/process-payment-receipt/index.ts')
edge = edge_path.read_text()
old = """          .eq('id', pendingOrder.id)
          .eq('status', 'pending_payment')
          .select('id')
          .maybeSingle();
"""
new = """          .eq('id', pendingOrder.id)
          .eq('status', 'pending_payment')
          .select('id')
          .limit(1)
          .maybeSingle();
"""
if new not in edge:
    if edge.count(old) != 1:
        raise SystemExit(f'legacy order lock anchor count: {edge.count(old)}')
    edge = edge.replace(old, new, 1)
edge_path.write_text(edge)

print('Secret prices post-patch polish applied.')
