import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const PlatformLayout = lazyPage("PlatformLayout");

export const Route = createFileRoute("/admin")({
  component: () => (<PageSuspense><PlatformLayout /></PageSuspense>),
});
