import React from "react";
import { Capacitor } from "@capacitor/core";

/** Official website shown on Iftin Digital Solutions' branding. */
export const IFTIN_DIGITAL_SOLUTIONS_URL = "https://iftindigitalsolutions.com/";

export default function PoweredByIftin({ className = "" }: { className?: string }) {
  return (
    <a
      href={IFTIN_DIGITAL_SOLUTIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => {
        if (!Capacitor.isNativePlatform()) return;
        // Native WebViews may ignore target=_blank. Capacitor handles
        // external top-level URLs through the device browser instead.
        event.preventDefault();
        window.location.assign(IFTIN_DIGITAL_SOLUTIONS_URL);
      }}
      aria-label="Fur website-ka Iftin Digital Solutions"
      className={`inline-flex items-center justify-center text-center font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm ${className}`}
    >
      Powered by Iftin Digital Solutions
    </a>
  );
}
