import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_ONESIGNAL_APP_ID = "e5260228-4238-43e6-9bb7-77d839e5907d";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const oneSignalKey = Deno.env.get("ONESIGNAL_REST_API_KEY");
    const oneSignalAppId = Deno.env.get("ONESIGNAL_APP_ID") || DEFAULT_ONESIGNAL_APP_ID;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }
    if (!oneSignalKey) {
      return json({ error: "Native push is not configured yet (ONESIGNAL_REST_API_KEY missing)" }, 503);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const tenantId = String(body?.tenant_id || "").trim();
    const title = String(body?.title || "").trim();
    const message = String(body?.message || "").trim();
    const type = String(body?.type || "info").trim() || "info";
    const route = typeof body?.route === "string" ? body.route.trim() : "";

    if (!tenantId || !title || !message) {
      return json({ error: "tenant_id, title and message are required" }, 400);
    }
    if (title.length > 120 || message.length > 1000 || route.length > 500) {
      return json({ error: "Notification content is too long" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const [{ data: globalRole }, { data: membership }] = await Promise.all([
      admin
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "super_admin"])
        .limit(1)
        .maybeSingle(),
      admin
        .from("tenant_members")
        .select("tenant_id, role")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle(),
    ]);

    const isSuperAdmin = globalRole?.role === "super_admin";
    const isTenantAdmin = Boolean(membership);
    if (!isSuperAdmin && !isTenantAdmin) {
      return json({ error: "Forbidden for this tenant" }, 403);
    }

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("id, slug, name")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError || !tenant?.slug) return json({ error: "Tenant not found" }, 404);

    // Persist the same message used by the in-app notifications page first.
    // Native push delivery may fail independently, but the notification remains
    // available in the tenant's history and can be retried safely by an admin.
    const { data: notification, error: insertError } = await admin
      .from("notifications")
      .insert({
        tenant_id: tenant.id,
        title,
        message,
        type,
        is_active: true,
      })
      .select("id, created_at")
      .single();

    if (insertError || !notification) {
      return json({ error: insertError?.message || "Could not save notification" }, 500);
    }

    const pushPayload = {
      app_id: oneSignalAppId,
      headings: { en: title },
      contents: { en: message },
      filters: [
        { field: "tag", key: "tenant_slug", relation: "=", value: tenant.slug },
      ],
      data: {
        tenant_id: tenant.id,
        tenant_slug: tenant.slug,
        notification_id: notification.id,
        ...(route ? { route } : {}),
      },
    };

    const pushResponse = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${oneSignalKey}`,
      },
      body: JSON.stringify(pushPayload),
    });

    const pushResult = await pushResponse.json().catch(() => ({}));
    if (!pushResponse.ok || pushResult?.errors) {
      console.error("OneSignal tenant push failed", {
        tenant_id: tenant.id,
        notification_id: notification.id,
        status: pushResponse.status,
        errors: pushResult?.errors ?? null,
      });
      return json({
        ok: false,
        saved: true,
        notification_id: notification.id,
        error: "Notification was saved but native push delivery failed",
      }, 502);
    }

    return json({
      ok: true,
      notification_id: notification.id,
      push_id: pushResult?.id ?? null,
      recipients: pushResult?.recipients ?? null,
    });
  } catch (error) {
    console.error("send-tenant-notification failed", error);
    return json({ error: "Unexpected server error" }, 500);
  }
});
