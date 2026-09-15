import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BusinessData {
  orders: {
    today: { count: number; revenue: number; profit: number; pending: number; failed: number; delivered: number; timeout: number };
    yesterday: { count: number; revenue: number; profit: number; pending: number; failed: number; delivered: number };
    week: { count: number; revenue: number; profit: number };
    month: { count: number; revenue: number; profit: number };
    all_time: { count: number; revenue: number; profit: number };
  };
  users: {
    total: number;
    today_new: number;
    yesterday_new: number;
  };
  devices: {
    total: number;
    online: number;
    offline: number;
  };
  providers: Array<{
    name: string;
    orders_today: number;
    orders_yesterday: number;
    orders_all_time: number;
    revenue_today: number;
    revenue_all_time: number;
    profit_today: number;
    profit_all_time: number;
  }>;
  top_packages: Array<{
    name: string;
    provider: string;
    sales_count: number;
    revenue: number;
  }>;
}

async function fetchBusinessData(supabaseAdmin: any): Promise<BusinessData> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
  const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Today's orders - include package_id for profit calculation
  const { data: todayOrders } = await supabaseAdmin
    .from('orders')
    .select('selling_price, delivery_status, provider_id, package_id')
    .gte('created_at', todayStart);

  // Yesterday's orders
  const { data: yesterdayOrders } = await supabaseAdmin
    .from('orders')
    .select('selling_price, delivery_status, provider_id, package_id')
    .gte('created_at', yesterdayStart)
    .lt('created_at', yesterdayEnd);

  // Week's orders
  const { data: weekOrders } = await supabaseAdmin
    .from('orders')
    .select('selling_price, provider_id, package_id')
    .gte('created_at', weekStart);

  // Month's orders
  const { data: monthOrders } = await supabaseAdmin
    .from('orders')
    .select('selling_price, provider_id, package_id')
    .gte('created_at', monthStart);

  // ALL TIME orders
  const { data: allOrders } = await supabaseAdmin
    .from('orders')
    .select('selling_price, provider_id, package_id, package_name');

  // Get cost prices for profit calculation
  const { data: packages } = await supabaseAdmin
    .from('data_packages_config')
    .select('id, cost_price, selling_price, provider_id, package_name');

  const packageMap = new Map(packages?.map((p: any) => [p.id, p]) || []);

  // Get providers with evoucher_rate
  const { data: providersData } = await supabaseAdmin
    .from('providers_config')
    .select('id, provider_name, evoucher_rate');

  const providerMap = new Map(providersData?.map((p: any) => [p.id, p]) || []);

  // Total users
  const { count: totalUsers } = await supabaseAdmin
    .from('verified_phones')
    .select('*', { count: 'exact', head: true });

  // Today's new users
  const { count: todayNewUsers } = await supabaseAdmin
    .from('verified_phones')
    .select('*', { count: 'exact', head: true })
    .gte('verified_at', todayStart);

  // Yesterday's new users
  const { count: yesterdayNewUsers } = await supabaseAdmin
    .from('verified_phones')
    .select('*', { count: 'exact', head: true })
    .gte('verified_at', yesterdayStart)
    .lt('verified_at', yesterdayEnd);

  // Devices status
  const { data: devices } = await supabaseAdmin
    .from('android_devices')
    .select('last_ping_at, is_active, archived_at')
    .is('archived_at', null)
    .eq('is_active', true);

  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const onlineDevices = devices?.filter((d: any) => d.last_ping_at && d.last_ping_at > fiveMinutesAgo).length || 0;

  // Provider stats for today AND all time
  const providerStats = providersData?.map((provider: any) => {
    const providerTodayOrders = todayOrders?.filter((o: any) => o.provider_id === provider.id) || [];
    const providerYesterdayOrders = yesterdayOrders?.filter((o: any) => o.provider_id === provider.id) || [];
    const providerAllOrders = allOrders?.filter((o: any) => o.provider_id === provider.id) || [];
    const evoucherRate = provider.evoucher_rate || 0;
    
    const calcProviderProfit = (orders: any[]) => {
      let profit = 0;
      orders.forEach((o: any) => {
        const pkg = packageMap.get(o.package_id);
        if (pkg) {
          const actualRevenue = o.selling_price * (1 + evoucherRate);
          profit += actualRevenue - pkg.cost_price;
        }
      });
      return profit;
    };
    
    return {
      name: provider.provider_name,
      orders_today: providerTodayOrders.length,
      orders_yesterday: providerYesterdayOrders.length,
      orders_all_time: providerAllOrders.length,
      revenue_today: providerTodayOrders.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0),
      revenue_all_time: providerAllOrders.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0),
      profit_today: calcProviderProfit(providerTodayOrders),
      profit_all_time: calcProviderProfit(providerAllOrders),
    };
  }) || [];

  // Top selling packages (all time)
  const packageSales = new Map<string, { name: string; provider: string; count: number; revenue: number }>();
  allOrders?.forEach((o: any) => {
    const key = o.package_id;
    const pkg = packageMap.get(o.package_id);
    const provider = providerMap.get(o.provider_id);
    if (pkg) {
      const existing = packageSales.get(key) || { name: o.package_name, provider: provider?.provider_name || 'Unknown', count: 0, revenue: 0 };
      existing.count += 1;
      existing.revenue += o.selling_price || 0;
      packageSales.set(key, existing);
    }
  });
  const topPackages = Array.from(packageSales.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate profits correctly: (selling_price * (1 + evoucher_rate)) - cost_price
  const calcProfit = (orders: any[]) => {
    return orders?.reduce((sum, o) => {
      const pkg = packageMap.get(o.package_id);
      const provider = providerMap.get(o.provider_id);
      const evoucherRate = provider?.evoucher_rate || 0;
      
      if (pkg) {
        const actualRevenue = o.selling_price * (1 + evoucherRate);
        return sum + (actualRevenue - pkg.cost_price);
      }
      return sum;
    }, 0) || 0;
  };

  return {
    orders: {
      today: {
        count: todayOrders?.length || 0,
        revenue: todayOrders?.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0) || 0,
        profit: calcProfit(todayOrders || []),
        pending: todayOrders?.filter((o: any) => o.delivery_status === 'pending').length || 0,
        failed: todayOrders?.filter((o: any) => o.delivery_status === 'failed').length || 0,
        timeout: todayOrders?.filter((o: any) => o.delivery_status === 'timeout').length || 0,
        delivered: todayOrders?.filter((o: any) => o.delivery_status === 'delivered').length || 0,
      },
      yesterday: {
        count: yesterdayOrders?.length || 0,
        revenue: yesterdayOrders?.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0) || 0,
        profit: calcProfit(yesterdayOrders || []),
        pending: yesterdayOrders?.filter((o: any) => o.delivery_status === 'pending').length || 0,
        failed: yesterdayOrders?.filter((o: any) => o.delivery_status === 'failed').length || 0,
        delivered: yesterdayOrders?.filter((o: any) => o.delivery_status === 'delivered').length || 0,
      },
      week: {
        count: weekOrders?.length || 0,
        revenue: weekOrders?.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0) || 0,
        profit: calcProfit(weekOrders || []),
      },
      month: {
        count: monthOrders?.length || 0,
        revenue: monthOrders?.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0) || 0,
        profit: calcProfit(monthOrders || []),
      },
      all_time: {
        count: allOrders?.length || 0,
        revenue: allOrders?.reduce((sum: number, o: any) => sum + (o.selling_price || 0), 0) || 0,
        profit: calcProfit(allOrders || []),
      },
    },
    users: {
      total: totalUsers || 0,
      today_new: todayNewUsers || 0,
      yesterday_new: yesterdayNewUsers || 0,
    },
    devices: {
      total: devices?.length || 0,
      online: onlineDevices,
      offline: (devices?.length || 0) - onlineDevices,
    },
    providers: providerStats,
    top_packages: topPackages,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user is admin
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch business data
    const businessData = await fetchBusinessData(supabaseAdmin);

    // Build context for AI with ALL historical data
    const dataContext = `
REAL-TIME BUSINESS DATA (Updated just now):

📦 ORDERS MAANTA (Today):
- Wadarta Orders: ${businessData.orders.today.count}
- Revenue: $${businessData.orders.today.revenue.toFixed(2)}
- Profit: $${businessData.orders.today.profit.toFixed(2)}
- Delivered: ${businessData.orders.today.delivered}
- Pending: ${businessData.orders.today.pending}
- Failed: ${businessData.orders.today.failed}
- Timeout (Xaqiiji): ${businessData.orders.today.timeout}

📦 ORDERS SHALAY (Yesterday):
- Wadarta Orders: ${businessData.orders.yesterday.count}
- Revenue: $${businessData.orders.yesterday.revenue.toFixed(2)}
- Profit: $${businessData.orders.yesterday.profit.toFixed(2)}
- Delivered: ${businessData.orders.yesterday.delivered}
- Pending: ${businessData.orders.yesterday.pending}
- Failed: ${businessData.orders.yesterday.failed}

📅 ORDERS TODDOBAADKAN (This Week):
- Wadarta: ${businessData.orders.week.count}
- Revenue: $${businessData.orders.week.revenue.toFixed(2)}
- Profit: $${businessData.orders.week.profit.toFixed(2)}

📆 ORDERS BISHA (This Month):
- Wadarta: ${businessData.orders.month.count}
- Revenue: $${businessData.orders.month.revenue.toFixed(2)}
- Profit: $${businessData.orders.month.profit.toFixed(2)}

📊 ORDERS DHAMMAAN WAKHTIGA (All Time):
- Wadarta: ${businessData.orders.all_time.count}
- Revenue: $${businessData.orders.all_time.revenue.toFixed(2)}
- Profit: $${businessData.orders.all_time.profit.toFixed(2)}

👥 USERS:
- Wadarta Users: ${businessData.users.total}
- Maanta Cusub: ${businessData.users.today_new}
- Shalay Cusub: ${businessData.users.yesterday_new}

📱 DEVICES:
- Wadarta Devices: ${businessData.devices.total}
- Online: ${businessData.devices.online}
- Offline: ${businessData.devices.offline}

🏢 PROVIDERS MAANTA:
${businessData.providers.map(p => `- ${p.name}: ${p.orders_today} orders, $${p.revenue_today.toFixed(2)} revenue, $${p.profit_today.toFixed(4)} profit`).join('\n')}

🏢 PROVIDERS SHALAY:
${businessData.providers.map(p => `- ${p.name}: ${p.orders_yesterday} orders`).join('\n')}

🏢 PROVIDERS DHAMMAAN WAKHTIGA (All Time):
${businessData.providers.map(p => `- ${p.name}: ${p.orders_all_time} orders, $${p.revenue_all_time.toFixed(2)} revenue, $${p.profit_all_time.toFixed(4)} profit`).join('\n')}

📦 TOP 10 PACKAGES (Best Sellers All Time):
${businessData.top_packages.map((p, i) => `${i+1}. ${p.name} (${p.provider}): ${p.sales_count} sales, $${p.revenue.toFixed(2)} revenue`).join('\n')}
`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are Najax Data Admin Assistant - Kaalmiyaha Admin-ka Najax Data.

Waxaad u adeegaysaa admin-ka warsadaha ganacsi-ga. Waxaad haysataa xogta database-ka DHAMMAANTEED - maanta, shalay, toddobaadkan, bisha, iyo dhammaan wakhtiga.

RULES:
1. Ku jawaab luuqadda uu admin-ku ku hadlay (Somali ama English)
2. Isticmaal tirooyin iyo statistics markaad u baahan tahay
3. Gaaban u jawaab - haddii admin-ku su'aal fudud weydiiyo, jawaab gaaban
4. Fadlan isticmaal formatting wanaagsan (bullets, numbers, etc.)
5. Haddii xog la'aan jirto, sheeg "Ma hayo xogtaas" ama "No data available"
6. XASUUSO WIXII LAGA SHEEKEYEY - marka admin-ku ku sheego wax, xasuuso oo isticmaal conversation-ka soo socota
7. Waxaad haysataa xogta DHAMMAAN wakhtiga - maanta, shalay, toddobaadkan, bisha, iyo all-time. Jawaab su'aalaha ku saabsan wakhti kasta!

${dataContext}

Based on the above data, answer the admin's questions accurately. Use the exact numbers from the data. You have access to historical data including yesterday, this week, this month, and all-time statistics.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("admin-ai-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
