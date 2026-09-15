/**
 * Multi-workspace account selection rules.
 * The database mirrors these rules in public.authorized_tenant_id(); this suite
 * locks the client behaviour so no arbitrary "first membership" pick returns.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { decideWorkspace } from '@/lib/workspaceMembership';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

describe('workspace selection for staff accounts', () => {
  it('0 memberships → denied', () => {
    expect(decideWorkspace({ memberships: [] })).toEqual({ status: 'denied' });
  });

  it('1 membership → selected automatically', () => {
    expect(decideWorkspace({ memberships: [A] })).toEqual({ status: 'ready', workspaceId: A });
  });

  it('2+ memberships with no hint → explicit choice, never a guess', () => {
    const d = decideWorkspace({ memberships: [A, B] });
    expect(d.status).toBe('choose');
    expect(d.status === 'choose' && d.options).toEqual([A, B]);
  });

  it('remembered workspace is used only while it is still a membership', () => {
    expect(decideWorkspace({ memberships: [A, B], rememberedWorkspaceId: B })).toEqual({
      status: 'ready',
      workspaceId: B,
    });
    // stale / removed membership
    expect(decideWorkspace({ memberships: [A, B], rememberedWorkspaceId: C }).status).toBe('choose');
  });

  it('a requested (slug/domain) workspace must be an authorized membership', () => {
    expect(decideWorkspace({ memberships: [A], requestedWorkspaceId: A })).toEqual({
      status: 'ready',
      workspaceId: A,
    });
    // forged workspace id
    expect(decideWorkspace({ memberships: [A], requestedWorkspaceId: B })).toEqual({
      status: 'denied',
    });
    expect(decideWorkspace({ memberships: [], requestedWorkspaceId: A })).toEqual({
      status: 'denied',
    });
  });

  it('removed membership revokes a previously valid selection', () => {
    expect(decideWorkspace({ memberships: [B], requestedWorkspaceId: A })).toEqual({
      status: 'denied',
    });
  });

  it('super admins are scoped by the opened workspace, not by membership', () => {
    expect(decideWorkspace({ memberships: [], requestedWorkspaceId: B, isSuperAdmin: true })).toEqual(
      { status: 'ready', workspaceId: B },
    );
    expect(decideWorkspace({ memberships: [], isSuperAdmin: true })).toEqual({ status: 'denied' });
  });

  it('never returns a workspace outside the membership set', () => {
    for (const remembered of [null, C, '']) {
      const d = decideWorkspace({ memberships: [A, B], rememberedWorkspaceId: remembered });
      if (d.status === 'ready') expect([A, B]).toContain(d.workspaceId);
    }
  });
});
