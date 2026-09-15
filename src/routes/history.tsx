import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("OrderHistory");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Order History — Iftin Agents" },
      { name: "description", content: "Review your previous bundle purchases and delivery status." },
      { property: "og:title", content: "Order History — Iftin Agents" },
      { property: "og:description", content: "Review your previous bundle purchases and delivery status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryRoute,
});

function HistoryRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
