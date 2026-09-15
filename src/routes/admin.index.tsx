import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("PlatformDashboard");


export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Platform Console — Iftin Agents" },
      { name: "description", content: "Super-admin overview of resellers, plans and platform revenue." },
      { property: "og:title", content: "Platform Console — Iftin Agents" },
      { property: "og:description", content: "Super-admin overview of resellers, plans and platform revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlatformDashboardRoute,
});

function PlatformDashboardRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
