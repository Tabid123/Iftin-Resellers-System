import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("Notifications");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/t/$slug/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Iftin Agents" },
      { name: "description", content: "See delivery updates, offers and account notifications." },
      { property: "og:title", content: "Notifications — Iftin Agents" },
      { property: "og:description", content: "See delivery updates, offers and account notifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsRoute,
});

function NotificationsRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
