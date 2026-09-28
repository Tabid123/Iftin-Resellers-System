import React from "react";

type TenantSplashProps = {
  logo?: string | null;
  name?: string | null;
  color?: string | null;
  pendingIdentity?: boolean;
};

/** One web splash surface for tenant resolution and lazy page loading. */
export function TenantSplash({ logo, name, color, pendingIdentity = false }: TenantSplashProps) {
  return (
    <div
      id="tenant-web-splash"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center ${pendingIdentity ? "bg-slate-900 text-white" : "bg-primary"}`}
      style={color ? { backgroundColor: color } : undefined}
      role="status"
      aria-label="Tenant-ka waa la furayaa"
    >
      {logo ? (
        <img
          src={logo}
          alt={name || ""}
          className="h-36 w-36 rounded-2xl object-cover shadow-lg"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : pendingIdentity && name ? (
        <span className="text-xl font-bold capitalize">{name.replace(/[-_]+/g, " ")}</span>
      ) : null}
      <div className={`mt-8 h-9 w-9 animate-spin rounded-full border-[3px] ${pendingIdentity ? "border-white/30 border-t-white" : "border-accent/30 border-t-accent"}`} />
    </div>
  );
}
