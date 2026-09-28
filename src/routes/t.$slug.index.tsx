import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
import { readVerifiedPhone } from "@/lib/verifiedPhone";
const Index = lazyPage("Index");

const hasOfflineRegistration = () => {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("hasSkippedOfflineRegistration") === "true") return true;
  const sender = localStorage.getItem("offlineSenderPhone");
  const receiver = localStorage.getItem("offlineReceiverPhone");
  return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
};


export const Route = createFileRoute("/t/$slug/")({
  beforeLoad: ({ params }) => {
    if (typeof window === "undefined") return;
    const phone = readVerifiedPhone();
    if (!phone) return;
    throw redirect({
      to: hasOfflineRegistration() ? "/t/$slug/providers" : "/t/$slug/offline-mode",
      params: { slug: params.slug },
      replace: true,
    });
  },
  head: () => ({
    meta: [
      { title: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { name: "description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:title", content: "Iftin Agents — Buy Mobile Data & Airtime in Somalia" },
      { property: "og:description", content: "Buy mobile data bundles and airtime instantly from Somali networks with fast, secure mobile-money payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (<PageSuspense><Index /></PageSuspense>),
});
