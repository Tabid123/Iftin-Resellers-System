/**
 * Path-based tenant URLs: `iftinagents.com/t/<slug>/...`
 *
 * Real routes exist under `/t/$slug/*`, so the tenant prefix stays visible in
 * the URL. Navigation helpers use these utilities to keep the prefix.
 */
export const TENANT_PREFIX_RE = /^\/t\/([^/]+)(?=\/|$)/;

export function matchTenantPrefix(pathname: string): string | null {
  const m = pathname.match(TENANT_PREFIX_RE);
  return m ? m[1] : null;
}

/** `/t/<slug>` for the given pathname, or "" when it is not a tenant path. */
export function tenantPathPrefix(pathname: string): string {
  const slug = matchTenantPrefix(pathname);
  return slug ? `/t/${slug}` : "";
}

/** Prefix an app path with the current `/t/<slug>` segment when present. */
export function withTenantPrefix(to: string, pathname: string): string {
  if (!to.startsWith("/")) return to;
  const prefix = tenantPathPrefix(pathname);
  if (!prefix) return to;
  if (to === prefix || to.startsWith(`${prefix}/`)) return to;
  if (matchTenantPrefix(to)) return to;
  return to === "/" ? prefix : `${prefix}${to}`;
}
