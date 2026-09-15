import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("AppsPage");

export const Route = createFileRoute("/admin/apps")({
  head: () => ({
    meta: [
      { title: "Apps — Platform Console" },
      { name: "description", content: "Publish downloadable apps for resellers." },
      { property: "og:title", content: "Apps — Platform Console" },
      { property: "og:description", content: "Publish downloadable apps for resellers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppsRoute,
});

function AppsRoute() {
  return <PageSuspense><Page /></PageSuspense>;
}
