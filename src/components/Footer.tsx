import React from "react";
import { Link, useLocation } from "@/lib/router-compat";
import PoweredByIftin from "@/components/PoweredByIftin";
const Footer = () => {
  const location = useLocation();
  return <footer className="text-center space-y-1.5 text-muted-foreground py-3">
      <PoweredByIftin className="text-sm" />
      <Link to="/privacy-policy" state={{ from: location.pathname }} className="text-primary hover:text-accent transition-colors underline text-xs">
        Secure privacy policy   
      </Link>
    </footer>;
};
export default Footer;