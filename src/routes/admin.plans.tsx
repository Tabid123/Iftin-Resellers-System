import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("PlansPage");


export const Route = createFileRoute("/admin/plans")({
  head: () => ({
    meta: [
      { title: "Plans — Platform Console" },
      { name: "description", content: "Configure subscription plans available to resellers." },
      { property: "og:title", content: "Plans — Platform Console" },
      { property: "og:description", content: "Configure subscription plans available to resellers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlansRoute,
});

function PlansRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
