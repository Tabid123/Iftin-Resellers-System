import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_PERMISSIONS = new Set([
  'restricted_access', 'manage_packages', 'manage_providers', 'manage_orders',
  'view_transactions', 'view_sales', 'view_profit', 'manage_users',
  'manage_settings', 'manage_devices', 'manage_bulk_sms', 'view_audit_log',
  'manage_admins',
]);

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

    // Verify the caller and resolve the tenant they are allowed to manage.
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

    const body = await req.json();
    const tenantId = String(body.tenant_id || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const full_name = (body.full_name || "").trim();
    const requestedPermissions = body.permissions;
    if (!Array.isArray(requestedPermissions) ||
      !requestedPermissions.every((key: unknown) => typeof key === 'string' && ALLOWED_PERMISSIONS.has(key))) {
      throw new Error('Invalid staff permissions');
    }
    const permissions: string[] = requestedPermissions.length
      ? [...new Set(['restricted_access', ...requestedPermissions])]
      : [];

    if (!tenantId) throw new Error("Tenant lama helin. Fadlan bogga dib u fur.");

    const [{ data: membership }, { data: platformRole }] = await Promise.all([
      supabaseAdmin
        .from("tenant_members")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", caller.id)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", caller.id)
        .eq("role", "super_admin")
        .maybeSingle(),
    ]);

    // Owner-only: staff cannot create a new full-access account or grant
    // permissions they do not possess (privilege escalation).
    const canManage = membership?.role === "owner" || platformRole?.role === "super_admin";
    if (!canManage) {
      return new Response(
        JSON.stringify({ error: "Ma lihid fasax aad admin ugu darto tenant-kan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email) throw new Error("Email is required");
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw new Error("Email format is invalid: " + email);
    if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
    if (!full_name) throw new Error("Full name is required");

    // Check if user already exists
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const existingUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
    
    let targetUser;

    if (existingUser) {
      // Check if this user is already an admin in this tenant.
      const { data: existingRole } = await supabaseAdmin
        .from("tenant_members")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (existingRole) {
        return new Response(
          JSON.stringify({ error: "User is already an admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update existing user's metadata with full_name
      await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        user_metadata: { ...existingUser.user_metadata, full_name },
      });

      targetUser = existingUser;
    } else {
      // Create new user account
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });

      if (createError) throw createError;
      targetUser = newUser.user;
    }

    // Write the restricted marker BEFORE the tenant membership. Otherwise
    // an error between these writes could briefly create a full-access admin.
    if (permissions.length > 0) {
      const { error: permError } = await supabaseAdmin
        .from("admin_permissions")
        .insert(permissions.map((key: string) => ({
          user_id: targetUser.id,
          permission_key: key,
          tenant_id: tenantId,
        })));
      if (permError) throw permError;
    }

    // Bind to this tenant only. Platform roles are never granted here.
    const { error: roleError } = await supabaseAdmin
      .from("tenant_members")
      .insert({ tenant_id: tenantId, user_id: targetUser.id, role: "admin" });
    if (roleError) {
      if (permissions.length > 0) {
        await supabaseAdmin.from("admin_permissions").delete()
          .eq("tenant_id", tenantId).eq("user_id", targetUser.id);
      }
      throw roleError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: targetUser.id, 
        email: targetUser.email,
        full_name,
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
