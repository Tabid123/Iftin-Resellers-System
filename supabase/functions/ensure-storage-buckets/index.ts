import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const BUCKETS = [
  { id: "provider-logos", public: true },
  { id: "banners", public: true },
  { id: "category-images", public: true },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: existing, error: listErr } =
      await admin.storage.listBuckets();
    if (listErr) throw listErr;
    const existingIds = new Set((existing || []).map((b: any) => b.id));

    const results: any[] = [];
    for (const b of BUCKETS) {
      if (existingIds.has(b.id)) {
        // Make sure it's public
        const { error: updErr } = await admin.storage.updateBucket(b.id, {
          public: b.public,
        });
        results.push({
          bucket: b.id,
          status: updErr ? "update_failed" : "exists",
          error: updErr?.message,
        });
      } else {
        const { error: createErr } = await admin.storage.createBucket(b.id, {
          public: b.public,
        });
        results.push({
          bucket: b.id,
          status: createErr ? "create_failed" : "created",
          error: createErr?.message,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
