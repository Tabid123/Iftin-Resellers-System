import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import evcLogo from "@/assets/payment-providers/evc-plus.png";
import edahabLogo from "@/assets/payment-providers/edahab.jpg";
import jeebLogo from "@/assets/payment-providers/jeeb.png";
import hormuudLogo from "@/assets/providers/hormuud-logo.jpeg";
import somtelLogo from "@/assets/providers/somtel-logo.jpg";

export function paymentLogoSrc(provider: string, customLogo?: string | null): string | null {
  if (customLogo && /^https:\/\/[^\s]+$/i.test(customLogo)) return customLogo;
  const name = (provider || "").toLowerCase().replace(/[\s_\-+]/g, "");
  if (name.includes("evc")) return evcLogo;
  if (name.includes("edahab")) return edahabLogo;
  if (name.includes("jeeb") || name.includes("somnet")) return jeebLogo;
  if (name.includes("hormuud")) return hormuudLogo;
  if (name.includes("somtel")) return somtelLogo;
  return null;
}

export default function ShopPaymentLogo({
  provider,
  logoUrl,
  size = "md",
}: {
  provider: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const src = paymentLogoSrc(provider, logoUrl);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const sizeClass = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-12 w-12" : "h-10 w-10";
  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white p-1`}>
      {src && !broken ? (
        <img
          src={src}
          alt={`${provider} logo`}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        <CreditCard className="h-5 w-5 text-primary" aria-label={provider} />
      )}
    </div>
  );
}
