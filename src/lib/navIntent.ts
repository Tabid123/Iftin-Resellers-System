/**
 * Global in-memory hand-off for navigation state.
 *
 * TanStack Router can render the destination route once before `location.state`
 * is hydrated, which briefly showed the wrong page/title (e.g. the brand view
 * instead of the selected category). We stash the state synchronously at
 * navigation time and merge it back in `useLocation()` until the router state
 * catches up. No URLs are changed.
 */
type Intent = { pathname: string; state: Record<string, unknown> };

let pending: (Intent & { at: number }) | null = null;

/** Intents are only a first-render bridge; ignore stale ones (e.g. back nav). */
const MAX_AGE_MS = 5000;

export function setNavIntent(pathname: string, state: unknown) {
  if (!state || typeof state !== "object") {
    pending = null;
    return;
  }
  pending = { pathname, state: state as Record<string, unknown>, at: Date.now() };
}

export function getNavIntent(pathname: string): Record<string, unknown> | null {
  if (!pending) return null;
  if (Date.now() - pending.at > MAX_AGE_MS) {
    pending = null;
    return null;
  }
  return pending.pathname === pathname ? pending.state : null;
}

export function clearNavIntent() {
  pending = null;
}
