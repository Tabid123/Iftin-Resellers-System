import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageSuspense, lazyPage } from "@/lib/lazyPages";
const Index = lazyPage("Index");

const isVerifiedPhone = (phone: string | null) => !!phone && /^(61|77|62|68)\d{7}$/.test(phone);

const hasOfflineRegistration = () => {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("hasSkippedOfflineRegistration") === "true") return true;
  const sender = localStorage.getItem("offlineSenderPhone");
  const receiver = localStorage.getItem("offlineReceiverPhone");
  return !!sender && !!receiver && sender.length === 9 && receiver.length >= 7;
};


export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const phone = localStorage.getItem("verifiedPhone");
    if (!isVerifiedPhone(phone)) return;
    throw redirect({
      to: hasOfflineRegistration() ? "/providers" : "/offline-mode",
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
