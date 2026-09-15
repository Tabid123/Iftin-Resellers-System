import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("PrivacyPolicy");


export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Iftin Agents" },
      { name: "description", content: "How Iftin Agents collects, uses and protects your personal data." },
      { property: "og:title", content: "Privacy Policy — Iftin Agents" },
      { property: "og:description", content: "How Iftin Agents collects, uses and protects your personal data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
