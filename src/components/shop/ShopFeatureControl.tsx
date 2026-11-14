import { useEffect, useState } from "react";
import { platformSupabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
export default function ShopFeatureControl({ tenantId }: { tenantId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError("");
    (async () => {
      const r = await (platformSupabase as any)
        .from("tenant_shop_features")
        .select("enabled")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!active) return;
      if (r.error) setError("Habeynta eCommerce lama soo akhrin karin. Hubi migration-ka.");
      else setEnabled(r.data?.enabled === true);
      setBusy(false);
    })();
    return () => {
      active = false;
    };
  }, [tenantId]);
  async function toggle() {
    setBusy(true);
    const { error } = await (platformSupabase as any)
      .from("tenant_shop_features")
      .upsert({ tenant_id: tenantId, enabled: !enabled }, { onConflict: "tenant_id" });
    if (error) toast({ title: "Lama kaydin", description: error.message, variant: "destructive" });
    else {
      setEnabled(!enabled);
      toast({ title: enabled ? "eCommerce waa la xiray" : "eCommerce waa la furay" });
    }
    setBusy(false);
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>eCommerce — Dukaanka</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p>
          Super Admin kaliya ayaa tenant-kan u furi kara ama ka xiri kara dukaanka. Xogta iyo
          dalabyadii hore lama tirtirayo.
        </p>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <Button
          role="switch"
          aria-checked={enabled}
          disabled={busy || !!error}
          onClick={toggle}
          variant={enabled ? "default" : "outline"}
        >
          {busy ? "Sug..." : enabled ? "ON — Xir eCommerce" : "OFF — Fur eCommerce"}
        </Button>
      </CardContent>
    </Card>
  );
}
