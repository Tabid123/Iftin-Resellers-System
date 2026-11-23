import React from "react";

/** Official website shown on Iftin Digital Solutions' branding. */
export const IFTIN_DIGITAL_SOLUTIONS_URL = "https://iftindigitalsolutions.com/";

export default function PoweredByIftin({ className = "" }: { className?: string }) {
  return (
    <a
      href={IFTIN_DIGITAL_SOLUTIONS_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fur website-ka Iftin Digital Solutions"
      className={`inline-flex items-center justify-center text-center font-medium text-primary hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm ${className}`}
    >
      Powered by Iftin Digital Solutions
    </a>
  );
}
