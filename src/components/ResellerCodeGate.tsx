import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storeTenantSlug } from "@/lib/nativeTenant";
import { Loader2, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Shown in the native app the first time it opens with no tenant baked in.
 * The user types the reseller code (tenant slug); it is validated against
 * Supabase and stored on the device.
 */
export const ResellerCodeGate: React.FC = () => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const slug = code.trim().toLowerCase();
    if (!slug) return;
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("get_tenant_by_slug", {
      p_slug: slug,
    });
    const tenant = Array.isArray(data) ? data[0] : data;
    setLoading(false);
    if (rpcError || !tenant) {
      setError("Code-kan lama helin. Fadlan hubi oo dib u isku day.");
      return;
    }
    storeTenantSlug(slug);
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 text-center">
        <Smartphone className="h-12 w-12 mx-auto text-primary" />
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Ku soo dhawoow</h1>
          <p className="text-sm text-muted-foreground">
            Geli code-ka wakiilkaaga si aad u furto app-kaaga.
          </p>
        </div>
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Tusaale: marwaan"
          autoCapitalize="none"
          autoCorrect="off"
          className="text-center"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !code.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sii wad"}
        </Button>
      </form>
    </div>
  );
};
