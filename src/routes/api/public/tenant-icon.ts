// Serves the active tenant's logo as a real image URL so it can be used for
// PWA manifest icons, apple-touch-icon and splash screens (data: URLs and
// private storage links are not reliable there).
import { createFileRoute } from '@tanstack/react-router';
import { fetchTenantBranding } from '@/lib/tenantBranding.server';

export const Route = createFileRoute('/api/public/tenant-icon')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get('tenant') || '').trim().toLowerCase();
        const fallback = () => Response.redirect(new URL('/icon-512.png', url.origin).toString(), 302);

        const tenant = await fetchTenantBranding(slug);
        const logo = tenant?.logo_url;
        if (!logo) return fallback();

        try {
          if (logo.startsWith('data:')) {
            const [meta, b64] = logo.split(',', 2);
            const type = meta.slice(5).split(';')[0] || 'image/png';
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Response(bytes, {
              headers: {
                'Content-Type': type,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          if (logo.startsWith('http')) {
            const res = await fetch(logo);
            if (!res.ok) return fallback();
            return new Response(res.body, {
              headers: {
                'Content-Type': res.headers.get('content-type') || 'image/png',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        } catch {
          /* fall through */
        }

        return fallback();
      },
    },
  },
});
