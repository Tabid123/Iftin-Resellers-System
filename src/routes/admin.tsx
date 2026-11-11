import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const PlatformLayout = lazyPage("PlatformLayout");

export const Route = createFileRoute("/admin")({
  // Pages already use React.lazy; keep the route shell out of a second split.
  codeSplitGroupings: [],
  component: () => (<PageSuspense><PlatformLayout /></PageSuspense>),
});
