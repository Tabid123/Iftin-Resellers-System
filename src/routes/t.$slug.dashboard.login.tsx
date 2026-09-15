import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("AdminLogin");


export const Route = createFileRoute("/t/$slug/dashboard/login")({
  head: () => ({
    meta: [
      { title: "Admin Login — Iftin Agents" },
      { name: "description", content: "Secure sign-in for Iftin Agents administrators." },
      { property: "og:title", content: "Admin Login — Iftin Agents" },
      { property: "og:description", content: "Secure sign-in for Iftin Agents administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminLoginRoute,
});

function AdminLoginRoute() {
  
  return <PageSuspense><Page /></PageSuspense>;
}
