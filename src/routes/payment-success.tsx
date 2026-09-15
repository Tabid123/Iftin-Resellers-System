import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("PaymentSuccess");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/payment-success")({
  head: () => ({
    meta: [
      { title: "Payment Successful — Iftin Agents" },
      { name: "description", content: "Your payment was received and your bundle is being delivered." },
      { property: "og:title", content: "Payment Successful — Iftin Agents" },
      { property: "og:description", content: "Your payment was received and your bundle is being delivered." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentSuccessRoute,
});

function PaymentSuccessRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
