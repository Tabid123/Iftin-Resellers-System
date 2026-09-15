// Per-tenant PWA manifest. Served publicly so the browser can fetch it
// without credentials during install ("Add to Home Screen").
import { createFileRoute } from '@tanstack/react-router';
import { fetchTenantBranding } from '@/lib/tenantBranding.server';

const DEFAULT_THEME = '#1E3A8A';

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value.trim());
}

export const Route = createFileRoute('/api/public/manifest')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = (url.searchParams.get('tenant') || '').trim().toLowerCase();

        let name = 'Iftin Agents';
        let shortName = 'Iftin';
        let themeColor = DEFAULT_THEME;
        let icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ];
        let scope = '/';

        const tenant = await fetchTenantBranding(slug);
        if (tenant) {
          name = tenant.name || name;
          shortName = (tenant.name || shortName).split(' ')[0].slice(0, 12);
          if (isHexColor(tenant.primary_color)) themeColor = tenant.primary_color.trim();
          scope = `/t/${tenant.slug}/`;
          if (tenant.logo_url) {
            const src = `/api/public/tenant-icon?tenant=${encodeURIComponent(tenant.slug)}`;
            icons = [
              { src, sizes: '192x192', type: 'image/png', purpose: 'any' },
              { src, sizes: '512x512', type: 'image/png', purpose: 'any' },
              { src, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            ];
          }
        }

        const manifest = {
          name,
          short_name: shortName,
          description: `${name} — iibso xirmooyinka internet-ka iyo airtime-ka.`,
          start_url: scope,
          scope,
          id: scope,
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#ffffff',
          theme_color: themeColor,
          lang: 'so',
          dir: 'ltr',
          categories: ['business', 'utilities'],
          icons,
        };

        return new Response(JSON.stringify(manifest), {
          headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8',
            'Cache-Control': 'public, max-age=300, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          },
        });
      },
    },
  },
});
