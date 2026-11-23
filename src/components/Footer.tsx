import React from "react";
import { Link, useLocation } from "@/lib/router-compat";
import PoweredByIftin from "@/components/PoweredByIftin";

const Footer = () => {
  const location = useLocation();

  return (
    <footer
      className="w-full max-w-md py-3 text-center text-muted-foreground"
      aria-label="Login links"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto auto",
        justifyItems: "center",
        rowGap: "10px",
      }}
    >
      <div
        className="w-full text-center"
        style={{ display: "block", gridColumn: "1", gridRow: "1" }}
      >
        <PoweredByIftin className="text-sm" />
      </div>
      <div
        className="w-full text-center"
        style={{ display: "block", gridColumn: "1", gridRow: "2" }}
      >
        <Link
          to="/privacy-policy"
          state={{ from: location.pathname }}
          className="text-xs text-primary underline hover:text-accent"
        >
          Secure privacy policy
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
