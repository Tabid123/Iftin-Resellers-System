import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Store,
  Search,
  ShoppingCart,
  Package,
  ShoppingBag,
  Plus,
  Minus,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop, shopDb, money, orderStatuses } from "./useShop";

import { ProductGallery } from "./ShopImages";
import ShopPaymentInstructions from "./ShopPaymentInstructions";
import ShopSupportFab from "./ShopSupportFab";
import { evcPlusDialCode } from "./evcPlusDial";
type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string;
  image_urls?: string[];
  price: number;
  stock: number;
};
type Category = { id: string; name: string; image_url: string };
type Cart = Record<string, number>;
const safeImage = (url: string) => (/^https:\/\//.test(url || "") ? url : undefined);
function ProductImage({ url, name }: { url: string; name: string }) {
  return safeImage(url) ? (
    <img
      src={url}
      alt={name}
      loading="lazy"
      className="aspect-square w-full rounded-xl bg-white object-contain p-2"
    />
  ) : (
    <div className="flex aspect-square items-center justify-center rounded-xl bg-primary/5">
      <ShoppingBag className="h-12 w-12 text-primary" />
    </div>
  );
}
export default function ShopPage() {
  const { tenant, enabled, loading, error } = useShop();
  if (loading) return <p className="p-8 text-center">Dukaanka waa la hubinayaa...</p>;
  if (!enabled || !tenant)
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Dukaanku hadda ma furna</h1>
        {error && <p>Hubi internet-kaaga ama isku day mar kale.</p>}
        <Link to="/providers" className="mt-4 block text-primary">
          ← Ku noqo app-ka
        </Link>
      </div>
    );
  return <ShopContent key={tenant.id} tenantId={tenant.id} tenantName={tenant.name} tenantSupportPhone={tenant.support_phone ?? ""} />;
}
function ShopContent({ tenantId, tenantName, tenantSupportPhone }: { tenantId: string; tenantName: string; tenantSupportPhone: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "home";
  const category = params.get("category");
  const productId = params.get("product");
  const go = (v: string, extra = "") => navigate(`/shop?view=${v}${extra}`);
  const storageKey = `shop:${tenantId}`;
  const [cart, setCart] = useState<Cart>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey + ":cart") || "{}");
      return Object.fromEntries(
        Object.entries(raw).filter(
          ([, n]) => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 99,
        ),
      ) as Cart;
    } catch {
      return {};
    }
  });
  const [tokens, setTokens] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey + ":orders") || "[]");
      return Array.isArray(value)
        ? value
            .filter(
              (token) =>
                typeof token === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                  token,
                ),
            )
            .slice(-50)
        : [];
    } catch {
      return [];
    }
  });
  const [search, setSearch] = useState("");
  const [quantity, setQuantity] = useState(1);
  // Keep the order ID so the payment screen uses the server-saved amount and payee.
  const [lastOrderId, setLastOrderId] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey + ":last-order-id") || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    setQuantity(1);
  }, [productId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [requestId, setRequestId] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey + ":request");
      return saved &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)
        ? saved
        : crypto.randomUUID();
    } catch {
      return crypto.randomUUID();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey + ":request", requestId);
    } catch {}
  }, [requestId, storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey + ":cart", JSON.stringify(cart));
    } catch {}
  }, [cart, storageKey]);
  const catalog = useQuery({
    queryKey: ["shop-catalog", tenantId],
    queryFn: async () => {
      const [c, p] = await Promise.all([
        shopDb
          .from("shop_categories")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name"),
        shopDb
          .from("shop_products")
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("active", true)
          .order("name"),
      ]);
      if (c.error || p.error) throw c.error || p.error;
      return { categories: c.data as Category[], products: p.data as Product[] };
    },
    staleTime: 0,
  });
  const checkoutSettings = useQuery({
    queryKey: ["shop-checkout-settings", tenantId],
    queryFn: async () => {
      const { data, error } = await shopDb
        .from("shop_checkout_settings")
        .select("payment_provider,payment_number,support_whatsapp,support_call")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        payment_provider: string;
        payment_number: string;
        support_whatsapp: string;
        support_call: string;
      } | null;
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  // One shared source for the tenant's FAB support numbers, managed in
  // Settings -> App Settings. Legacy eCommerce support values remain a fallback
  // until the tenant saves a new global FAB contact row.
  const fabContacts = useQuery({
    queryKey: ["tenant-fab-contacts", tenantId],
    queryFn: async () => {
      const { data, error } = await shopDb
        .from("tenant_fab_contacts")
        .select("support_whatsapp,support_call")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data as { support_whatsapp: string; support_call: string } | null;
    },
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });
  const orders = useQuery({
    queryKey: ["shop-orders", tenantId, tokens],
    enabled: view === "orders" || view === "success",
    refetchInterval: 15000,
    queryFn: async () => {
      if (!tokens.length) return [];
      const { data, error } = await shopDb.rpc("shop_order_history", {
        p_tokens: tokens.slice(-50),
      });
      if (error) throw error;
      return data || [];
    },
  });
  const lastOrder = orders.data?.find((o: any) => o.id === lastOrderId);
  const paymentNumber = checkoutSettings.data?.payment_number ?? "";
  const paymentProvider = checkoutSettings.data?.payment_provider || "Mobile Money";
  const supportWhatsApp = fabContacts.data
    ? (fabContacts.data.support_whatsapp || tenantSupportPhone)
    : (checkoutSettings.data?.support_whatsapp || tenantSupportPhone);
  const supportCall = fabContacts.data
    ? (fabContacts.data.support_call || tenantSupportPhone)
    : (checkoutSettings.data?.support_call || tenantSupportPhone);
  const products = catalog.data?.products || [];
  const categories = catalog.data?.categories || [];
  const selected = products.find((p) => p.id === productId);
  const availableQuantity = selected
    ? Math.max(0, Math.min(99, selected.stock) - (cart[selected.id] || 0))
    : 0;
  const chosenQuantity = Math.min(quantity, availableQuantity);
  const cartItems = products.filter((p) => cart[p.id]);
  const unavailable = Object.keys(cart).some((id) => !products.some((p) => p.id === id));
  const total = cartItems.reduce((sum, p) => sum + p.price * cart[p.id], 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const change = (p: Product, delta: number) => {
    setMessage("");
    setRequestId(crypto.randomUUID());
    setCart((old) => {
      const next = { ...old };
      const n = Math.min(99, p.stock, Math.max(0, (old[p.id] || 0) + delta));
      if (n) next[p.id] = n;
      else delete next[p.id];
      return next;
    });
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !cartItems.length || unavailable || checkoutSettings.isLoading || checkoutSettings.isError) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await shopDb.rpc("shop_place_order", {
        p_token: requestId,
        p_expected_total: Number(total.toFixed(2)),
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_address: address.trim(),
        p_items: Object.entries(cart).map(([product_id, quantity]) => ({ product_id, quantity })),
      });
      if (error) throw error;
      setLastOrderId(String(data.id));
      try {
        sessionStorage.setItem(storageKey + ":last-order-id", String(data.id));
      } catch {
        // Checkout must still succeed when session storage is unavailable.
      }
      const next = [...new Set([...tokens, data.token])].slice(-50);
      // Persist the private receipt before clearing the cart or showing success.
      localStorage.setItem(storageKey + ":orders", JSON.stringify(next));
      setTokens(next);
      setCart({});
      setRequestId(crypto.randomUUID());
      go("success");
    } catch (e: any) {
      setMessage(e.message || "Dalabka lama dirin. Isku day mar kale.");
    } finally {
      setBusy(false);
    }
  }
  const nav = [
    { view: "home", label: "Dukaan", Icon: Store },
    { view: "search", label: "Raadi", Icon: Search },
    { view: "cart", label: "Dambiil", Icon: ShoppingCart },
    { view: "orders", label: "Dalabyadayda", Icon: Package },
  ];
  return (
    <div
      className={`shop-screen ${view === "product" ? "shop-detail" : ""} min-h-screen bg-background pb-28 ${view === "home" || view === "search" ? "shop-catalog-screen" : ""}`}
    >
      <style>{`
        .shop-detail > header { padding: 10px 12px !important; }
        .shop-detail > main { max-width: 480px; padding: 14px 20px 104px; }
        .shop-detail > main > .detail-gallery { margin-top: 0; }
        .shop-detail .detail-gallery img { max-height: 260px; }
        .shop-detail .detail-footer > div { max-width: 440px; gap: 14px; }
        .shop-detail .detail-gallery { margin-bottom: 10px; }
        .shop-detail .detail-name { font-size: 23px; line-height: 28px; font-weight: 800; letter-spacing: -.5px; }
        .shop-detail .detail-price { font-size: 24px; line-height: 30px; font-weight: 800; }
        .shop-detail .detail-footer { padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); }
        .shop-screen { font-family: Arial, Helvetica, sans-serif; -webkit-text-size-adjust: 100%; }
        .shop-screen > header { padding: 10px 13px 14px; }
        .shop-screen > header h1 { font-size: 22px; line-height: 26px; font-weight: 800; letter-spacing: -.5px; }
        .shop-screen > header button { align-items: center; font-size: 14px; gap: 4px; }
        .shop-screen > header button svg { width: 25px; height: 25px; }
        .shop-catalog-screen > main { padding: 12px 13px 24px; display: flex; flex-direction: column; gap: 26px; }
        .shop-catalog-screen > main > * { margin-block: 0; }
        .shop-catalog-screen section h2 { font-size: 20px; line-height: 26px; font-weight: 800; letter-spacing: -.5px; margin: 0; }
        .shop-catalog-screen section:first-of-type > div { margin-top: 6px; }
        .shop-catalog-screen section:first-of-type input { height: 40px; padding-left: 43px; border-radius: 12px; font-size: 15px; }
        .shop-catalog-screen section:first-of-type svg { left: 16px; width: 19px; height: 19px; }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] { margin-top: -10px; }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] > div { margin: 18px -13px 0; padding: 8px 23px 4px; gap: 12px; }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] button { width: 76px; gap: 6px; }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] button > span:first-child { width: 76px; height: 76px; padding: 3px; flex-shrink: 0; transform: scale(1); transition: transform 220ms cubic-bezier(.2,.8,.2,1), border-color 220ms ease, box-shadow 220ms ease; }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] button[aria-pressed="true"] > span:first-child { transform: scale(1.06); }
        @media (prefers-reduced-motion: reduce) { .shop-catalog-screen section[aria-labelledby="shop-categories"] button > span:first-child { transition: none; } }
        .shop-catalog-screen section[aria-labelledby="shop-categories"] button > span:last-child { min-height: 0; font-size: 12px; line-height: 16px; }
        .shop-catalog-screen section[aria-labelledby="shop-products"] > div { margin-top: 12px; gap: 10px; }
        .shop-catalog-screen article { padding: 12px; border-radius: 11px; }
        .shop-catalog-screen article img, .shop-catalog-screen article button > div { height: 112px; aspect-ratio: auto; padding: 0; border-radius: 8px; }
        .shop-catalog-screen article h3 { font-size: 15px; line-height: 18px; font-weight: 700; margin-top: 8px; }
        .shop-catalog-screen article p { font-size: 11px; line-height: 15px; margin-top: 3px; gap: 4px; }
        .shop-catalog-screen article p svg { width: 12px; height: 12px; }
        .shop-catalog-screen article > div { margin-top: 4px; }
        .shop-catalog-screen article > div > span { font-size: 18px; line-height: 26px; font-weight: 800; }
        .shop-catalog-screen article > div > button { width: 29px; height: 27px; min-height: 27px; border-radius: 6px; }
        .shop-catalog-screen article > div > button svg { width: 20px; height: 20px; }
        .shop-screen > nav button { font-size: 12px; line-height: 16px; padding: 10px 2px; gap: 5px; border-radius: 12px 12px 0 0; }
        .shop-screen > nav svg { width: 25px; height: 25px; }
        @media (min-width: 480px) { .shop-catalog-screen article img, .shop-catalog-screen article button > div { height: 170px; } }
      `}</style>
      <header className="bg-primary px-4 py-5 text-primary-foreground">
        {view === "product" ? (
          <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
            <button aria-label="Ku noqo dukaanka" onClick={() => go("home")}>
              <ArrowLeft className="h-5 w-5" />
            </button>
            <strong className="truncate text-lg">{tenantName}</strong>
            <button
              aria-label="Fur dambiisha"
              className="relative flex items-center"
              onClick={() => go("cart")}
            >
              <ShoppingCart />
              <span className="absolute -right-1 -top-1 rounded-full bg-white px-1 text-[10px] text-primary">
                {count}
              </span>
            </button>
          </div>
        ) : (
          <div className="mx-auto max-w-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to="/providers"
                  aria-label="Ku noqo app-ka"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="text-[28px] font-extrabold tracking-tight">Dukaanka</h1>
              </div>
              <button aria-label="Fur dambiisha" onClick={() => go("cart")} className="flex gap-1">
                <ShoppingCart />
                {count}
              </button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-xl space-y-7 p-4">
        {view !== "home" && view !== "product" && (
          <button className="flex items-center gap-2 text-primary" onClick={() => go("home")}>
            <ArrowLeft className="h-4 w-4" />
            Dukaanka
          </button>
        )}
        {message && (
          <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-destructive">
            {message}
          </p>
        )}
        {catalog.isLoading && <p>Waa la soo dejinayaa...</p>}
        {catalog.isError && (
          <div role="alert">
            Alaabta lama soo akhrin karin.{" "}
            <Button variant="outline" onClick={() => catalog.refetch()}>
              Isku day mar kale
            </Button>
          </div>
        )}
        {(view === "home" || view === "search") && (
          <>
            <section className="space-y-3">
              <h2 className="text-[22px] font-extrabold tracking-tight">Maxaad raadineysaa?</h2>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="Raadi alaab"
                  placeholder="Raadi alaab..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-14 rounded-2xl border bg-card pl-12 text-base shadow-sm"
                />
              </div>
            </section>
            <section aria-labelledby="shop-categories" className="space-y-4">
              <h2 id="shop-categories" className="text-xl font-extrabold tracking-tight">
                Qaybaha Alaabta
              </h2>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[{ id: "", name: "Dhammaan", image_url: "" }, ...categories].map((c) => {
                  const active = (category || "") === c.id;
                  return (
                    <button
                      key={c.id}
                      aria-pressed={active}
                      onClick={() => go(view, c.id ? `&category=${encodeURIComponent(c.id)}` : "")}
                      className={`flex w-[76px] shrink-0 flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "font-bold text-primary" : "text-foreground"}`}
                    >
                      <span
                        className={`flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-2 bg-card p-1 ${active ? "border-primary ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border"}`}
                      >
                        {safeImage(c.image_url) ? (
                          <img
                            src={c.image_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full rounded-full bg-white object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-primary/5 to-primary/15">
                            <ShoppingBag className="h-8 w-8 text-primary" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="line-clamp-2 min-h-9 w-full break-words text-center text-xs leading-4">
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            <section aria-labelledby="shop-products" className="space-y-4">
              <h2 id="shop-products" className="text-xl font-extrabold tracking-tight">
                Alaabta Dukaanka
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {products
                  .filter(
                    (p) =>
                      (!category || p.category_id === category) &&
                      p.name.toLowerCase().includes(search.trim().toLowerCase()),
                  )
                  .map((p) => (
                    <article
                      key={p.id}
                      className="min-w-0 overflow-hidden rounded-2xl border bg-card p-3 shadow-[0_2px_6px_rgba(20,30,60,0.09)]"
                    >
                      <button
                        onClick={() => go("product", `&product=${p.id}`)}
                        className="block w-full text-left"
                      >
                        <ProductImage url={p.image_url} name={p.name} />
                        <h3 className="mt-2 line-clamp-2 break-words text-base font-bold leading-tight">
                          {p.name}
                        </h3>
                      </button>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {p.stock > 0 && (
                          <CheckCircle2
                            className="h-3.5 w-3.5 shrink-0 fill-green-600 text-white"
                            aria-hidden="true"
                          />
                        )}
                        {p.stock > 0 ? "Waa diyaar" : "Waa dhammaatay"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-1">
                        <span className="text-lg font-extrabold text-primary">
                          {money(p.price)}
                        </span>
                        <Button
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-lg"
                          aria-label={`Ku dar ${p.name}`}
                          disabled={!p.stock || (cart[p.id] || 0) >= Math.min(p.stock, 99)}
                          onClick={() => change(p, 1)}
                        >
                          <Plus className="h-5 w-5" />
                        </Button>
                      </div>
                    </article>
                  ))}
              </div>
              {!catalog.isLoading &&
                !catalog.isError &&
                !products.some(
                  (p) =>
                    (!category || p.category_id === category) &&
                    p.name.toLowerCase().includes(search.trim().toLowerCase()),
                ) && (
                  <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">
                    {products.length
                      ? "Alaab lama helin."
                      : "Alaabta dukaanka dhowaan ayaa la soo gelinayaa."}
                  </p>
                )}
            </section>
          </>
        )}
        {view === "product" &&
          (selected ? (
            <>
              {selected.image_url || selected.image_urls?.length ? (
                <ProductGallery key={selected.id} product={selected} />
              ) : (
                <ProductImage url={selected.image_url} name={selected.name} />
              )}
              <div className="!mt-4 space-y-2">
                <h2 className="detail-name">{selected.name}</h2>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="detail-price text-primary">{money(selected.price)}</p>
                  <span
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${selected.stock ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {selected.stock ? "Waa diyaar" : "Waa dhammaatay"}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {selected.description}
                </p>
              </div>
              <div className="!mt-4 flex items-center gap-5 border-t pt-4">
                <span className="text-sm font-bold">Tirada</span>
                <div className="flex items-center rounded-lg border bg-card p-1">
                  <button
                    aria-label="Yaree tirada"
                    className="flex h-8 w-9 items-center justify-center rounded bg-muted disabled:opacity-40"
                    disabled={chosenQuantity <= 1}
                    onClick={() => setQuantity(Math.max(1, chosenQuantity - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span aria-live="polite" className="w-10 text-center text-sm">
                    {chosenQuantity}
                  </span>
                  <button
                    aria-label="Kordhi tirada"
                    className="flex h-8 w-9 items-center justify-center rounded bg-muted disabled:opacity-40"
                    disabled={chosenQuantity >= availableQuantity}
                    onClick={() => setQuantity(chosenQuantity + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="!mt-4 flex items-center gap-3 rounded-xl bg-primary/5 p-3 text-xs">
                <Truck className="h-5 w-5 shrink-0 text-primary" />
                Gaarsiinta dukaanka ayaa kula xaqiijinaya.
              </p>
              <div className="detail-footer fixed inset-x-0 bottom-0 z-50 border-t bg-background shadow-[0_-4px_20px_#172b4d08]">
                <div className="mx-auto flex max-w-xl items-center gap-5">
                  <strong className="text-2xl font-extrabold">
                    {money(selected.price * chosenQuantity)}
                  </strong>
                  <Button
                    className="h-12 flex-1 gap-2 rounded-xl text-sm"
                    disabled={chosenQuantity < 1}
                    onClick={() => {
                      change(selected, chosenQuantity);
                      go("cart");
                    }}
                  >
                    <ShoppingCart className="h-5 w-5" />
                    Ku dar dambiisha
                  </Button>
                </div>
              </div>
            </>
          ) : (
            !catalog.isLoading && <p>Alaabtan hadda lama heli karo.</p>
          ))}
        {(view === "cart" || view === "checkout") && (
          <>
            <h2 className="text-xl font-bold">
              {view === "cart" ? "Dambiisha" : "Dhammaystir dalabka"}
            </h2>
            {unavailable && (
              <div role="alert">
                Alaab dambiisha ku jirta hadda lama heli karo.{" "}
                <Button
                  onClick={() => {
                    setCart((old) =>
                      Object.fromEntries(
                        Object.entries(old).filter(([id]) => products.some((p) => p.id === id)),
                      ),
                    );
                    setRequestId(crypto.randomUUID());
                  }}
                >
                  Ka saar alaabta aan la heli karin
                </Button>
              </div>
            )}
            {cartItems.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <div className="w-16 shrink-0">
                  <ProductImage url={p.image_url} name={p.name} />
                </div>
                <div className="flex-1">
                  <strong>{p.name}</strong>
                  <p>{money(p.price * cart[p.id])}</p>
                  {cart[p.id] > p.stock && (
                    <p role="alert">Stock-ga hadda: {p.stock}. Yaree tirada.</p>
                  )}
                </div>
                <button aria-label={`Yaree ${p.name}`} onClick={() => change(p, -1)}>
                  <Minus className="h-4 w-4" />
                </button>
                <span>{cart[p.id]}</span>
                <button
                  aria-label={`Kordhi ${p.name}`}
                  disabled={cart[p.id] >= p.stock}
                  onClick={() => change(p, 1)}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ))}
            {!count && <p>Dambiishaadu waa madhan tahay.</p>}
            <div className="rounded-xl border p-4">
              <p className="flex justify-between font-bold">
                <span>Wadarta alaabta</span>
                {money(total)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Gaarsiinta dukaanka ayaa kula xaqiijinaya.{" "}
                {checkoutSettings.isLoading ? "Lacag-bixinta waa la soo akhrinayaa..." :
                  paymentNumber ? "Lacagta waxaad u diri doontaa lambarka dukaanka." :
                    "Lacagta waxaa la bixinayaa marka la keeno."}
              </p>
            </div>
            {view === "cart" && (
              <Button
                className="w-full"
                disabled={!count || unavailable || cartItems.some((p) => cart[p.id] > p.stock)}
                onClick={() => go("checkout")}
              >
                Sii wad dalabka →
              </Button>
            )}
            {view === "checkout" && (
              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  Magaca
                  <Input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <label className="block">
                  Telefoonka
                  <Input
                    required
                    type="tel"
                    minLength={9}
                    maxLength={20}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
                <label className="block">
                  Cinwaanka
                  <Input
                    required
                    minLength={5}
                    maxLength={500}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
                {checkoutSettings.isLoading && <p className="text-sm">Xogta lacag-bixinta waa la soo akhrinayaa...</p>}
                {checkoutSettings.isError && (
                  <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-sm">
                    <p>Lambarka lacag-bixinta lama soo akhrin karo. Dib u tijaabi ka hor dalabka.</p>
                    <Button type="button" variant="outline" onClick={() => void checkoutSettings.refetch()}>Isku day mar kale</Button>
                  </div>
                )}
                {!checkoutSettings.isLoading && !checkoutSettings.isError && (
                  <ShopPaymentInstructions provider={paymentProvider} number={paymentNumber} />
                )}
                {evcPlusDialCode(paymentProvider, paymentNumber, total) && (
                  <p className="rounded-xl bg-primary/5 p-3 text-sm">
                    Marka hore diiwaangeli dalabka. Bogga xiga taabo “Bixi Hadda”
                    si EVC Plus uga furmo telefoonkaaga.
                  </p>
                )}
                <Button className="w-full" disabled={busy || !count || unavailable || checkoutSettings.isLoading || checkoutSettings.isError}>
                  {busy ? "Waa la dirayaa..." : "Diiwaangeli dalabka"}
                </Button>
              </form>
            )}
          </>
        )}
        {view === "success" && (
          <div className="space-y-4 rounded-2xl border p-6 text-center">
            <Package className="mx-auto h-14 w-14 text-primary" />
            <h2 className="text-2xl font-bold">Dalabka waa la helay</h2>
            <p>Dalabka waa la diiwaangeliyay. Dukaanka ayaa kula soo xiriiraya.</p>
            {orders.isLoading ? (
              <p className="text-sm">Xogta dalabka iyo lacag-bixinta waa la soo akhrinayaa...</p>
            ) : orders.isError ? (
              <p role="alert" className="text-sm text-destructive">Faahfaahinta lacag-bixinta lama soo akhrin karo. Ka eeg Dalabyadayda.</p>
            ) : lastOrder?.payment_method === "manual_transfer" ? (
              <ShopPaymentInstructions
                provider={lastOrder.payment_provider || "Mobile Money"}
                number={lastOrder.payment_number || ""}
                amount={Number(lastOrder.total)}
              />
            ) : lastOrder ? (
              <p className="text-sm text-muted-foreground">Lacagta waxaa la bixinayaa marka la keeno.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Faahfaahinta lacag-bixinta ka eeg Dalabyadayda.</p>
            )}
            <Button onClick={() => go("orders")}>La soco dalabka</Button>
          </div>
        )}
        {view === "orders" && (
          <>
            <h2 className="text-xl font-bold">Dalabyadayda</h2>
            <p className="text-sm text-muted-foreground">
              Dalabyada lagu sameeyay qalabkan. Hayso xogta browser-ka si aad ula socoto.
            </p>
            {orders.isLoading && <p>Sug...</p>}
            {orders.isError && <p role="alert">Dalabyada lama soo akhrin karin.</p>}
            {orders.data?.map((o: any) => (
              <article key={o.id} className="space-y-3 rounded-2xl border bg-card p-4">
                <div className="flex justify-between">
                  <strong>#{o.id.slice(0, 8)}</strong>
                  <span>{money(o.total)}</span>
                </div>
                <p>{new Date(o.created_at).toLocaleString()}</p>
                <p className="font-semibold text-primary">
                  {orderStatuses[o.status as keyof typeof orderStatuses]}
                </p>
                {o.items.map((i: any) => (
                  <p key={i.product_id}>
                    {i.name} × {i.quantity}
                  </p>
                ))}
                <div className="text-sm">
                  {o.payment_method === "manual_transfer" ? (
                    <ShopPaymentInstructions
                      provider={o.payment_provider || "Mobile Money"}
                      number={o.payment_number || ""}
                      amount={["received", "preparing", "dispatched"].includes(o.status) ? Number(o.total) : undefined}
                    />
                  ) : (
                    <p>Lacag-bixinta: Marka la keeno</p>
                  )}
                </div>
              </article>
            ))}
            {orders.data?.length === 0 && <p>Weli dalab ma lihid.</p>}
          </>
        )}
      </main>
      <ShopSupportFab whatsapp={supportWhatsApp} call={supportCall} />
      {view !== "checkout" && view !== "product" && (
        <nav
          aria-label="Dukaanka"
          className="fixed inset-x-0 bottom-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto grid max-w-xl grid-cols-4">
            {nav.map(({ view: v, label, Icon }) => (
              <button
                key={v}
                onClick={() => go(v)}
                aria-current={view === v ? "page" : undefined}
                className={`flex flex-col items-center gap-1 rounded-t-2xl px-1 py-3 text-xs ${view === v ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground"}`}
              >
                <span className="flex gap-1">
                  <Icon className="h-6 w-6" />
                  {v === "cart" && count > 0 && count}
                </span>
                {label}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
