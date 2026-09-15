// Server-side tenant branding lookup (public data: name, logo, colors).
const SUPABASE_URL = 'https://bpkddmxpyeyxvjyebull.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwa2RkbXhweWV5eHZqeWVidWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NTQ5NzEsImV4cCI6MjA5NjMzMDk3MX0.vHVvxVI2x87aWeiNlzwIoCqU1y-tNlvbc0j_PJcRuvk';

export interface TenantBranding {
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  support_phone: string | null;
}

export async function fetchTenantBranding(slug: string): Promise<TenantBranding | null> {
  if (!slug || !/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_tenant_by_slug`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      slug: String(row.slug ?? slug),
      name: String(row.name ?? ''),
      logo_url: row.logo_url ?? null,
      primary_color: row.primary_color ?? null,
      support_phone: row.support_phone ?? null,
    };
  } catch {
    return null;
  }
}
