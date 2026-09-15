import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
import TrialExpiryBanner from "@/components/admin/TrialExpiryBanner";
const Page = lazyPage("SimpleAdminDashboard");


export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Iftin Agents" },
      { name: "description", content: "Manage orders, devices, SIMs, payments and customers." },
      { property: "og:title", content: "Admin Dashboard — Iftin Agents" },
      { property: "og:description", content: "Manage orders, devices, SIMs, payments and customers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDashboardRoute,
});

function AdminDashboardRoute() {
  return (
    <>
      <PageSuspense><Page /></PageSuspense>
      <TrialExpiryBanner />
    </>
  );
}
