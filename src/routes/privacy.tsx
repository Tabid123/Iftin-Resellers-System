import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";

const Page = lazyPage("PrivacyPolicy");

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Iftin Agents" },
      { name: "description", content: "Privacy Policy." },
    ],
  }),
  component: PrivacyAliasRoute,
});

function PrivacyAliasRoute() {
  return <PageSuspense><Page /></PageSuspense>;
}
