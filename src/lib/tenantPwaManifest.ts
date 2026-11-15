/** Separate tenant customer and admin apps with distinct manifest identities. */
export function isTenantAdminPath(pathname: string): boolean {
  return /^(?:\/t\/[^/]+)?\/dashboard(?:\/|$)/.test(pathname);
}

export function tenantAdminManifestHref(slug?: string | null): string {
  const tenantQuery = slug ? `&tenant=${encodeURIComponent(slug)}` : '';
  return `/api/public/manifest?app=admin${tenantQuery}`;
}

export function tenantCustomerManifestHref(slug?: string | null): string {
  return slug ? `/api/public/manifest?tenant=${encodeURIComponent(slug)}` : '/manifest.json';
}

export function adminManifestIdentity(slug?: string | null) {
  const validSlug = slug && /^[a-z0-9-]{1,60}$/.test(slug) ? slug : null;
  const path = validSlug ? `/t/${validSlug}/dashboard/` : '/dashboard/';
  const id = validSlug ? `/t/${validSlug}/admin-pwa` : '/admin-pwa';
  return { start_url: path, scope: path, id };
}
