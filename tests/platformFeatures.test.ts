import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

describe('platform eCommerce feature controls', () => {
  it('registers Features in the Super Admin navigation and page loader', () => {
    expect(read('src/components/pages/platform/PlatformLayout.tsx')).toContain("to: '/admin/features'")
    expect(read('src/lib/lazyPages.tsx')).toContain('FeaturesPage:')
    expect(read('src/routes/admin.features.tsx')).toContain('createFileRoute("/admin/features")')
  })

  it('supports tenant selection, feature plan selection, and explicit ON/OFF save', () => {
    const page = read('src/components/pages/platform/FeaturesPage.tsx')
    expect(page).toContain("from('tenant_shop_features')")
    expect(page).toContain('onConflict: \'tenant_id\'')
    expect(page).toContain('plan_id: selectedPlan')
    expect(page).toContain('enabled: nextEnabled')
    expect(page).toContain('ON — Fur eCommerce')
    expect(page).toContain('OFF — Xir eCommerce')
  })

  it('keeps commercial tenant billing separate from eCommerce entitlements', () => {
    const page = read('src/components/pages/platform/FeaturesPage.tsx')
    expect(page).not.toContain(".from('tenants').update(")
    expect(read('supabase/migrations/20261114200000_ecommerce_feature_plan.sql'))
      .toContain('add column if not exists plan_id uuid')
  })
})
