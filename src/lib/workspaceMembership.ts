/**
 * Workspace selection for signed-in staff accounts.
 *
 * Rules (mirrored by `public.authorized_tenant_id()` in the database, which is
 * the real authorization boundary):
 *   - 0 memberships                → access denied
 *   - 1 membership                 → selected automatically
 *   - 2+ memberships               → explicit choice required
 *   - a remembered workspace is honoured ONLY while it is still a membership
 *   - a workspace requested by slug/domain is honoured ONLY while it is a membership
 *
 * There is no LIMIT 1 / "first row wins" anywhere: an unauthorized or stale
 * selection resolves to "denied" or "choose", never to somebody else's data.
 */
import { supabase } from '@/integrations/supabase/client';

export const LAST_WORKSPACE_KEY = 'iftin:last-workspace';

export type WorkspaceDecision =
  | { status: 'denied' }
  | { status: 'ready'; workspaceId: string }
  | { status: 'choose'; options: string[] };

export interface WorkspaceDecisionInput {
  /** Distinct workspace ids the account is actually a member of. */
  memberships: string[];
  /** Workspace demanded by the authoritative slug/domain, if any. */
  requestedWorkspaceId?: string | null;
  /** Workspace remembered on this device — a hint only, never authoritative. */
  rememberedWorkspaceId?: string | null;
  /** Platform super admins are not workspace members. */
  isSuperAdmin?: boolean;
}

export function decideWorkspace(input: WorkspaceDecisionInput): WorkspaceDecision {
  const memberships = Array.from(new Set((input.memberships ?? []).filter(Boolean)));
  const requested = input.requestedWorkspaceId || null;

  if (input.isSuperAdmin) {
    // Platform admins are scoped by the workspace they opened, not by membership.
    return requested ? { status: 'ready', workspaceId: requested } : { status: 'denied' };
  }

  if (memberships.length === 0) return { status: 'denied' };

  if (requested) {
    return memberships.includes(requested)
      ? { status: 'ready', workspaceId: requested }
      : { status: 'denied' };
  }

  if (memberships.length === 1) return { status: 'ready', workspaceId: memberships[0] };

  const remembered = input.rememberedWorkspaceId || null;
  if (remembered && memberships.includes(remembered)) {
    return { status: 'ready', workspaceId: remembered };
  }

  return { status: 'choose', options: memberships };
}

/** All workspaces the signed-in account belongs to. No LIMIT, no ordering trust. */
export async function fetchMemberships(userId: string): Promise<string[]> {
  const { data } = await supabase.from('tenant_members').select('tenant_id').eq('user_id', userId);
  return Array.from(
    new Set((Array.isArray(data) ? data : []).map((r: any) => r?.tenant_id).filter(Boolean)),
  ) as string[];
}

export function rememberWorkspace(workspaceId: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (workspaceId) window.localStorage.setItem(LAST_WORKSPACE_KEY, workspaceId);
    else window.localStorage.removeItem(LAST_WORKSPACE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function rememberedWorkspace(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(LAST_WORKSPACE_KEY);
  } catch {
    return null;
  }
}
