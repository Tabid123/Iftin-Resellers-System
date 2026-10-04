import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";

const Page = lazyPage("PrivacyPolicy");

export const Route = createFileRoute("/t/$slug/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Galeyr Data" },
      { name: "description", content: "Privacy Policy for Galeyr Data." },
    ],
  }),
  component: PrivacyAliasRoute,
});

function PrivacyAliasRoute() {
  return <PageSuspense><Page /></PageSuspense>;
}
