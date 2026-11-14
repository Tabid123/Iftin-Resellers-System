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
} from "lucide-react";
import { Link, useLocation, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop, shopDb, money, orderStatuses } from "./useShop";

type Product = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  image_url: string;
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
      className="aspect-square w-full rounded-xl bg-primary/5 object-contain"
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
  return <ShopContent key={tenant.id} tenantId={tenant.id} tenantName={tenant.name} />;
}
function ShopContent({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
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
  const products = catalog.data?.products || [];
  const categories = catalog.data?.categories || [];
  const selected = products.find((p) => p.id === productId);
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
    if (busy || !cartItems.length || unavailable) return;
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
    <div className="min-h-screen bg-background pb-28">
      <header className="bg-primary px-4 py-4 text-primary-foreground">
        <div className="mx-auto max-w-xl">
          <Link to="/providers" className="mb-2 flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" />
            {tenantName}
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Dukaanka</h1>
            <button aria-label="Fur dambiisha" onClick={() => go("cart")} className="flex gap-1">
              <ShoppingCart />
              {count}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-5 p-4">
        {view !== "home" && (
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
        {view === "home" && (
          <>
            <h2 className="text-2xl font-bold">Maxaad raadineysaa?</h2>
            <button
              onClick={() => go("search")}
              className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-muted-foreground"
            >
              <Search />
              Raadi alaab...
            </button>
            <div className="flex items-center gap-4 rounded-2xl bg-primary/10 p-5 text-primary">
              <ShoppingBag className="h-12 w-12" />
              <strong className="text-xl">Wax kasta oo aad u baahan tahay</strong>
            </div>
            <h2 className="text-lg font-bold">Qaybaha Alaabta</h2>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => go("search", `&category=${c.id}`)}
                  className="overflow-hidden rounded-2xl border bg-card text-left"
                >
                  <ProductImage url={c.image_url} name={c.name} />
                  <span className="block p-3 font-semibold">{c.name} →</span>
                </button>
              ))}
            </div>
            {!catalog.isLoading && !categories.length && <p>Qaybaha alaabta weli lama gelin.</p>}
            <Button className="w-full" variant="outline" onClick={() => go("search")}>
              Eeg dhammaan alaabta →
            </Button>
          </>
        )}
        {view === "search" && (
          <>
            <h2 className="text-xl font-bold">
              {categories.find((c) => c.id === category)?.name || "Dhammaan alaabta"}
            </h2>
            <Input
              aria-label="Raadi alaab"
              placeholder="Raadi alaab..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              {products
                .filter(
                  (p) =>
                    (!category || p.category_id === category) &&
                    p.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((p) => (
                  <div key={p.id} className="rounded-2xl border bg-card p-2">
                    <button
                      onClick={() => go("product", `&product=${p.id}`)}
                      className="w-full text-left"
                    >
                      <ProductImage url={p.image_url} name={p.name} />
                      <strong className="block py-2">{p.name}</strong>
                    </button>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">{money(p.price)}</span>
                      <Button
                        size="icon"
                        aria-label={`Ku dar ${p.name}`}
                        disabled={!p.stock || (cart[p.id] || 0) >= p.stock}
                        onClick={() => change(p, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {!p.stock && <p className="text-sm">Waa dhammaatay</p>}
                  </div>
                ))}
            </div>
            {!catalog.isLoading &&
              !products.filter(
                (p) =>
                  (!category || p.category_id === category) &&
                  p.name.toLowerCase().includes(search.toLowerCase()),
              ).length && <p>Alaab lama helin.</p>}
          </>
        )}
        {view === "product" &&
          (selected ? (
            <>
              <ProductImage url={selected.image_url} name={selected.name} />
              <h2 className="text-2xl font-bold">{selected.name}</h2>
              <p className="text-2xl font-bold text-primary">{money(selected.price)}</p>
              <p className="whitespace-pre-wrap">{selected.description}</p>
              <p>{selected.stock ? "Waa diyaar" : "Waa dhammaatay"}</p>
              <Button
                className="w-full"
                disabled={!selected.stock || (cart[selected.id] || 0) >= selected.stock}
                onClick={() => {
                  change(selected, 1);
                  go("cart");
                }}
              >
                Ku dar dambiisha
              </Button>
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
                Gaarsiinta dukaanka ayaa kula xaqiijinaya. Lacagta waxaa la bixinayaa marka la
                keeno.
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
                <p>Lacag-bixinta: Marka la keeno</p>
                <Button className="w-full" disabled={busy || !count || unavailable}>
                  {busy ? "Waa la dirayaa..." : "Xaqiiji dalabka"}
                </Button>
              </form>
            )}
          </>
        )}
        {view === "success" && (
          <div className="space-y-4 rounded-2xl border p-6 text-center">
            <Package className="mx-auto h-14 w-14 text-primary" />
            <h2 className="text-2xl font-bold">Dalabka waa la helay</h2>
            <p>Lacagta weli lama bixin. Dukaanka ayaa kula soo xiriiraya.</p>
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
                <p className="text-sm">Lacag-bixinta: Marka la keeno</p>
              </article>
            ))}
            {orders.data?.length === 0 && <p>Weli dalab ma lihid.</p>}
          </>
        )}
      </main>
      {view !== "checkout" && (
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
                className={`flex flex-col items-center gap-1 px-1 py-3 text-xs ${view === v ? "bg-primary/10 font-bold text-primary" : "text-muted-foreground"}`}
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
