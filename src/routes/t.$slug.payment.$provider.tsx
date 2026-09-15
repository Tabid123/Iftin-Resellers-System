import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("PaymentProviders");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/t/$slug/payment/$provider")({
  head: () => ({
    meta: [
      { title: "Payment — Iftin Agents" },
      { name: "description", content: "Pay for your bundle securely with your preferred mobile money provider." },
      { property: "og:title", content: "Payment — Iftin Agents" },
      { property: "og:description", content: "Pay for your bundle securely with your preferred mobile money provider." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentRoute,
});

function PaymentRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
