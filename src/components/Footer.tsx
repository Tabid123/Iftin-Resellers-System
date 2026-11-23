import React from "react";
import { Link, useLocation } from "@/lib/router-compat";
import PoweredByIftin from "@/components/PoweredByIftin";

const Footer = () => {
  const location = useLocation();

  return (
    <footer className="flex flex-col items-center justify-center gap-2 py-3 text-center text-muted-foreground">
      <PoweredByIftin className="text-sm" />
      <Link
        to="/privacy-policy"
        state={{ from: location.pathname }}
        className="block text-xs text-primary underline hover:text-accent"
      >
        Secure privacy policy
      </Link>
    </footer>
  );
};

export default Footer;
