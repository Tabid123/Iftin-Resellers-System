import { createFileRoute } from '@tanstack/react-router';
import { PLATFORM_ICON_URL } from '@/lib/platformBrand';

/** Public, same-origin icon for platform favicon and PWA manifest. */
export const Route = createFileRoute('/api/public/platform-icon')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Use the real, already bundled Iftin Resellers logo, never a tenant's
        // logo or the old global Najax icon. The imported asset is fingerprinted.
        return Response.redirect(new URL(PLATFORM_ICON_URL, request.url).toString(), 302);
      },
    },
  },
});
