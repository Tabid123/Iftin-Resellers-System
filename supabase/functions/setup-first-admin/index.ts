import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    // Check if any admin already exists
    const { data: existingAdmins } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .limit(1);

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: "Admin already exists. This function can only be used for initial setup." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email and password are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Super Admin" },
    });

    if (createError) throw createError;

    // Assign super_admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "super_admin" });
    if (roleError) throw roleError;

    // Also assign admin role for backward compatibility
    const { error: roleError2 } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUser.user.id, role: "admin" });
    if (roleError2) console.warn("Admin role insert:", roleError2.message);

    // Grant all permissions
    const allPermissions = [
      "manage_packages", "manage_providers", "manage_orders",
      "view_transactions", "manage_users", "manage_settings",
      "manage_devices", "manage_bulk_sms", "view_audit_log", "manage_admins"
    ];

    await supabaseAdmin
      .from("admin_permissions")
      .insert(allPermissions.map(key => ({
        user_id: newUser.user.id,
        permission_key: key,
      })));

    return new Response(
      JSON.stringify({
        success: true,
        message: "Super admin created successfully",
        email: newUser.user.email,
        user_id: newUser.user.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
