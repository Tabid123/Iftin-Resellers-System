import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tenant-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller and restrict lookups to the requested tenant.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Session-ka admin-ka lama helin. Fadlan dib u gal." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: "Session-ka admin-ka wuu dhacay. Fadlan dib u gal." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_ids, tenant_id } = await req.json();
    if (!user_ids || !Array.isArray(user_ids)) throw new Error("user_ids array required");
    if (!tenant_id) throw new Error("Tenant lama helin");

    const [{ data: membership }, { data: platformRole }] = await Promise.all([
      supabaseAdmin.from("tenant_members").select("role")
        .eq("tenant_id", tenant_id).eq("user_id", caller.id).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role")
        .eq("user_id", caller.id).eq("role", "super_admin").maybeSingle(),
    ]);
    if (!membership && !platformRole) {
      return new Response(
        JSON.stringify({ error: "Ma lihid fasax tenant-kan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: allowedMembers, error: membersError } = await supabaseAdmin
      .from("tenant_members")
      .select("user_id")
      .eq("tenant_id", tenant_id)
      .in("user_id", user_ids);
    if (membersError) throw membersError;
    const allowedIds = new Set((allowedMembers || []).map((member: any) => member.user_id));

    const users = [];
    for (const uid of user_ids.filter((id: string) => allowedIds.has(id))) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (user) {
        users.push({
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || null,
        });
      }
    }

    return new Response(
      JSON.stringify({ users }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
