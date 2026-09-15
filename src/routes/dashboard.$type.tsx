import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("SimpleAdminDetail");


export const Route = createFileRoute("/dashboard/$type")({
  head: () => ({
    meta: [
      { title: "Admin Details — Iftin Agents" },
      { name: "description", content: "Detailed admin view for orders, devices and payment records." },
      { property: "og:title", content: "Admin Details — Iftin Agents" },
      { property: "og:description", content: "Detailed admin view for orders, devices and payment records." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDetailRoute,
});

function AdminDetailRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
