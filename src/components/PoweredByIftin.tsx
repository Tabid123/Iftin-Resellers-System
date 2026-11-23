import React from "react";
import { Capacitor } from "@capacitor/core";

/** Official website and logo used for Iftin Digital Solutions branding. */
export const IFTIN_DIGITAL_SOLUTIONS_URL = "https://iftindigital.com/";
export const IFTIN_DIGITAL_SOLUTIONS_LOGO = "/iftin-digital-solutions-logo.png";

type PoweredByIftinProps = {
  className?: string;
  /** The Profile footer uses the logo; login footers keep the existing text. */
  variant?: "text" | "logo";
};

export default function PoweredByIftin({
  className = "",
  variant = "text",
}: PoweredByIftinProps) {
  return (
    <a
      href={IFTIN_DIGITAL_SOLUTIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!Capacitor.isNativePlatform()) return;
        // Native WebViews may ignore target=_blank. Preserve the existing
        // external URL handoff that works in reseller Android apps.
        event.preventDefault();
        window.location.assign(IFTIN_DIGITAL_SOLUTIONS_URL);
      }}
      aria-label="Fur website-ka Iftin Digital Solutions"
      className={`inline-flex min-h-11 max-w-full items-center justify-center rounded-sm text-center font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${className}`}
    >
      {variant === "logo" ? (
        <img
          src={IFTIN_DIGITAL_SOLUTIONS_LOGO}
          alt="Iftin Digital Solutions"
          width={450}
          height={86}
          className="h-auto w-[220px] max-w-[70vw] object-contain"
          decoding="async"
        />
      ) : (
        <span className="hover:underline">Powered by Iftin Digital Solutions</span>
      )}
    </a>
  );
}
