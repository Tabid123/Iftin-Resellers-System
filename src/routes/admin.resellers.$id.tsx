import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("ResellerDetailPage");


export const Route = createFileRoute("/admin/resellers/$id")({
  head: () => ({
    meta: [
      { title: "Reseller Details — Platform Console" },
      { name: "description", content: "Inspect and edit a reseller tenant, plan and payment history." },
      { property: "og:title", content: "Reseller Details — Platform Console" },
      { property: "og:description", content: "Inspect and edit a reseller tenant, plan and payment history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResellerDetailRoute,
});

function ResellerDetailRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
