import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("FeaturesPage");

export const Route = createFileRoute("/admin/features")({
  codeSplitGroupings: [],
  head: () => ({ meta: [
    { title: "Features — Platform Console" },
    { name: "description", content: "Control tenant eCommerce entitlements and plan assignments." },
  ] }),
  component: () => <PageSuspense><Page /></PageSuspense>,
});
