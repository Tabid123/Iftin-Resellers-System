import { createFileRoute } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Page = lazyPage("Profile");
import ProtectedRoute from "@/components/ProtectedRoute";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — Iftin Agents" },
      { name: "description", content: "Manage your phone number, language and app preferences." },
      { property: "og:title", content: "Your Profile — Iftin Agents" },
      { property: "og:description", content: "Manage your phone number, language and app preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfileRoute,
});

function ProfileRoute() {
  return (<ProtectedRoute><PageSuspense><Page /></PageSuspense></ProtectedRoute>);
}
