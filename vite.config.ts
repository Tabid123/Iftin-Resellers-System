// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "true";

export default defineConfig({
  // Nitro repackages the server entry as `index.mjs`. TanStack's SPA
  // prerender preview expects its own `server.js`, so skip Nitro only for the
  // local Capacitor bundle. Normal web builds keep the Cloudflare adapter.
  ...(isCapacitorBuild ? { nitro: false } : {}),
  tanstackStart: {
    // The web deployment uses our SSR error wrapper. Capacitor's SPA shell must
    // use TanStack Start's default entry so its build-time shell request can be
    // handled without the custom SSR response normalization layer.
    ...(!isCapacitorBuild ? { server: { entry: "server" } } : {}),
    // Capacitor needs a static entry document. Keep the normal web deployment SSR-enabled,
    // but emit an SPA shell as index.html for the Android packaging workflow.
    ...(isCapacitorBuild
      ? {
          spa: {
            enabled: true,
            maskPath: "/",
            prerender: { outputPath: "/index" },
          },
        }
      : {}),
  },
});
