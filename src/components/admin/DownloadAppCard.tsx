import React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Download, Smartphone } from "lucide-react";

/**
 * Reseller dashboard card: link to the tenant's own Android app build.
 * Hidden until CI has published an APK for the tenant.
 */
export const DownloadAppCard: React.FC = () => {
  const { tenant } = useTenant();

  const { data } = useQuery({
    queryKey: ["tenant-apk", tenant?.id],
    enabled: Boolean(tenant?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("apk_url, apk_version, apk_updated_at")
        .eq("id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        apk_url: string | null;
        apk_version: string | null;
        apk_updated_at: string | null;
      } | null;
    },
  });

  const rawUrl = data?.apk_url ?? null;
  const isAbsolute = Boolean(rawUrl && /^https?:\/\//i.test(rawUrl));

  const { data: signedUrl } = useQuery({
    queryKey: ["tenant-apk-signed", rawUrl],
    enabled: Boolean(rawUrl) && !isAbsolute,
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const path = rawUrl!.replace(/^apks\//, "");
      const { data: signed, error } = await supabase.storage
        .from("apks")
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return signed.signedUrl;
    },
  });

  const href = isAbsolute ? rawUrl : signedUrl;
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden shadow-md active:scale-95 transition-transform"
    >

      <div
        className="p-4 text-white flex items-center gap-3"
        style={{ background: "var(--gradient-primary, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))))" }}
      >
        <Smartphone className="h-8 w-8 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold">App-kayga soo dejiso</div>
          <div className="text-xs opacity-80">
            Android APK{data?.apk_version ? ` · v${data.apk_version}` : ""}
            {data?.apk_updated_at
              ? ` · ${new Date(data.apk_updated_at).toLocaleDateString()}`
              : ""}
          </div>
        </div>
        <Download className="h-5 w-5 shrink-0" />
      </div>
    </a>
  );
};
