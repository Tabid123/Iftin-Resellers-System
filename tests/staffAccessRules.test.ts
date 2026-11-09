import { describe, expect, it } from 'vitest';
import { mayViewStaffPage, RESTRICTED_ACCESS_MARKER, STAFF_PERMISSION_KEYS } from '../src/lib/staffAccessRules';

describe('owner-controlled staff navigation permissions', () => {
  it('has an explicit restricted marker and independent sales/profit grants', () => {
    expect(RESTRICTED_ACCESS_MARKER).toBe('restricted_access');
    expect(STAFF_PERMISSION_KEYS).toContain('view_sales');
    expect(STAFF_PERMISSION_KEYS).toContain('view_profit');
  });

  it('does not expose pages while loading or after authorization fails', () => {
    expect(mayViewStaffPage('/dashboard/transactions', 'loading', new Set())).toBe(false);
    expect(mayViewStaffPage('/dashboard/sales', 'denied', new Set())).toBe(false);
  });

  it('allows owners full access while enforcing staff permissions individually', () => {
    const keys = new Set(['view_sales', RESTRICTED_ACCESS_MARKER]);
    expect(mayViewStaffPage('/dashboard/sales', 'restricted', keys)).toBe(true);
    expect(mayViewStaffPage('/dashboard/transactions', 'restricted', keys)).toBe(false);
    expect(mayViewStaffPage('/dashboard/iftin-wallet', 'restricted', keys)).toBe(false);
    expect(mayViewStaffPage('/dashboard/transactions', 'full', new Set())).toBe(true);
  });

  it('requires all relevant permissions for a financial transaction page', () => {
    const keys = new Set(['view_sales', 'view_profit', 'view_transactions']);
    expect(mayViewStaffPage('/dashboard/transactions', 'restricted', keys)).toBe(true);
    keys.delete('view_profit');
    expect(mayViewStaffPage('/dashboard/transactions', 'restricted', keys)).toBe(false);
  });

  it('denies unrecognized destinations to restricted staff', () => {
    expect(mayViewStaffPage('/dashboard/future-secret', 'restricted', new Set(STAFF_PERMISSION_KEYS))).toBe(false);
    expect(mayViewStaffPage('/dashboard', 'restricted', new Set())).toBe(true);
  });
});
