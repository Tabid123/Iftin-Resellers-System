import React from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ResellerCodeGate } from "@/components/ResellerCodeGate";
import { AlertCircle, Loader2, Lock, MessageCircle, WifiOff } from "lucide-react";
import { normalizeSupportPhone } from "@/hooks/useSupportPhone";



interface Props {
  children: React.ReactNode;
}

/**
 * Wraps the app and gates rendering on tenant resolution.
 * - loading  → spinner
 * - not_found → message
 * - suspended → blocking banner
 * - ready / platform → render children
 */
export const TenantGate: React.FC<Props> = ({ children }) => {
  const state = useTenant();

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "needs_code") {
    return <ResellerCodeGate />;
  }

  if (state.status === "offline") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <WifiOff className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">Xiriir ma jiro</h1>
          <p className="text-muted-foreground">
            App-ku ma gaari karo server-ka hadda. Hubi internet-kaaga — waan
            isku dayi doonnaa mar kale si toos ah.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "not_found") {

    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-6xl font-bold text-muted-foreground">404</div>
          <AlertCircle className="h-12 w-12 mx-auto text-destructive" />
          <h1 className="text-2xl font-bold">Workspace lama helin</h1>
          <p className="text-muted-foreground">
            Subdomain-kani ma xidhna workspace shaqaynaya. Hubi URL-ka ama la
            xidhiidh maamulaha platform-ka.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "suspended") {
    const waPhone = normalizeSupportPhone(state.tenant?.support_phone ?? null);
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: "#0b0b14", color: "#fff" }}
      >
        <div className="max-w-md text-center space-y-6 flex-1 flex flex-col items-center justify-center">
          <Lock className="h-14 w-14 mx-auto" style={{ color: "#ef4444" }} />
          <h1 className="text-2xl font-bold">
            Nidaamkaagu wuu xiran yahay, la xiriir Admin-ka guud
          </h1>
        </div>
        <a
          href={`https://wa.me/252${waPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-md flex items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white active:scale-[0.98] transition-transform"
          style={{ background: "#25D366" }}
        >
          <MessageCircle className="h-5 w-5" />
          La xiriir WhatsApp
        </a>
      </div>
    );
  }


  return <>{children}</>;
};
