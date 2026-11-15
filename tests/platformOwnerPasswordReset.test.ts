import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('Super Admin tenant owner password reset safety', () => {
  it('selects owner explicitly and never falls back to alphabetically first admin', () => {
    const source = read('supabase/functions/platform-reset-tenant-password/index.ts');
    expect(source).toContain(".eq('role', 'owner')");
    expect(source).toContain("if (!owners?.length)");
    expect(source).toContain("if (owners.length > 1)");
    expect(source).toContain('getUserById(ownerId)');
    expect(source).toContain('updateUserById(\n      ownerId,');
    expect(source).not.toContain(".order('role', { ascending: true })");
    expect(source).not.toContain('updateUserById(\n      member.user_id,');
  });

  it('verifies the expected email, keeps a super-admin check, and does not expose password in logs', () => {
    const source = read('supabase/functions/platform-reset-tenant-password/index.ts');
    expect(source).toContain("r.role === 'super_admin'");
    expect(source).toContain('expected_owner_email');
    expect(source).toContain('if (expectedEmail && expectedEmail !== ownerEmail)');
    expect(source).toContain('getUserById(ownerId)');
    expect(source).not.toContain('console.log(password)');
  });

  it('shows owner email before resetting, does not display stale credentials from another tenant', () => {
    const view = read('src/components/pages/platform/ResellerDetailPage.tsx');
    expect(view).toContain('Reset Owner Password');
    expect(view).toContain('expected_owner_email: ownerEmail');
    expect(view).toContain('disabled={resetting || !ownerEmail}');
    expect(view).toContain('setNewCreds(null)');
    expect(view).toContain('setOwnerEmail(null)');
    expect(view).toContain('Admin-yada kale lama beddelayo');
  });

  it('applies the same owner-only selection to impersonation links', () => {
    const source = read('supabase/functions/platform-impersonate-tenant/index.ts');
    expect(source).toContain(".eq('role', 'owner')");
    expect(source).toContain('getUserById(ownerId)');
    expect(source).not.toContain(".order('role', { ascending: true })");
  });
});
