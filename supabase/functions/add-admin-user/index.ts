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

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) throw new Error("Not authenticated");

    const { data: callerRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .single();
    if (!callerRole) throw new Error("Not authorized");

    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();
    const full_name = (body.full_name || "").trim();
    const permissions = body.permissions || [];

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
      // Check if already admin
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("role", "admin")
        .single();

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

    // Add admin role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: targetUser.id, role: "admin" });
    if (roleError) throw roleError;

    // Add permissions if provided
    if (permissions && permissions.length > 0) {
      const { error: permError } = await supabaseAdmin
        .from("admin_permissions")
        .insert(permissions.map((key: string) => ({
          user_id: targetUser.id,
          permission_key: key,
        })));
      if (permError) throw permError;
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
