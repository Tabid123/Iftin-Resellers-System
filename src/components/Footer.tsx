import React from "react";
import { Link, useLocation } from "@/lib/router-compat";
const Footer = () => {
  const location = useLocation();
  return <footer className="text-center space-y-1.5 text-muted-foreground py-3">
      <p className="text-sm font-medium">Developed by Saabir</p>
      <Link to="/privacy-policy" state={{ from: location.pathname }} className="text-primary hover:text-accent transition-colors underline text-xs">
        Secure privacy policy   
      </Link>
    </footer>;
};
export default Footer;