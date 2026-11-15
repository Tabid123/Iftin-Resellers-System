import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop, shopDb, money, orderStatuses } from "./useShop";
import { useNavigate } from "@/lib/router-compat";
import {
  Search,
  Plus,
  Pencil,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
function Thumb({ url, name }: { url: string; name: string }) {
  return (
    <span className="shop-admin-thumb">
      {url?.startsWith("https://") ? (
        <img src={url} alt={name} loading="lazy" />
      ) : (
        <Package aria-hidden="true" />
      )}
    </span>
  );
}
import ShopImages, { productImages } from "./ShopImages";
const blank = {
  id: "",
  category_id: "",
  name: "",
  description: "",
  image_url: "",
  image_urls: [] as string[],
  price: "0",
  stock: "0",
  originalStock: 0,
  active: true,
};
export default function ShopAdmin({
  section = "products",
}: {
  section?: "products" | "categories" | "stock" | "orders";
}) {
  const navigate = useNavigate();
  const { tenant, enabled, loading } = useShop();
  const qc = useQueryClient();
  const tab = section;
  const categoryForm = useRef<HTMLDetailsElement>(null);
  const productForm = useRef<HTMLDetailsElement>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  function openEditor(ref: { current: HTMLDetailsElement | null }) {
    if (ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }
  const [categoryId, setCategoryId] = useState("");
  const [stockEdits, setStockEdits] = useState<Record<string, { value: string; expected: number }>>(
    {},
  );
  const [stockSearch, setStockSearch] = useState("");
  const [orderFilter, setOrderFilter] = useState("all");
  const [form, setForm] = useState(blank);
  const [category, setCategory] = useState("");
  const [categoryImage, setCategoryImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["shop-admin", tenant?.id],
    enabled: enabled && !!tenant,
    queryFn: async () => {
      const [c, p, o] = await Promise.all([
        shopDb.from("shop_categories").select("*").eq("tenant_id", tenant!.id).order("name"),
        shopDb.from("shop_products").select("*").eq("tenant_id", tenant!.id).order("name"),
        shopDb
          .from("shop_orders")
          .select("id,customer_name,phone,address,items,total,status,created_at")
          .eq("tenant_id", tenant!.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (c.error || p.error || o.error) throw c.error || p.error || o.error;
      return { categories: c.data, products: p.data, orders: o.data };
    },
    refetchInterval: 30000,
  });
  async function mutate(action: () => PromiseLike<any>, done?: () => void) {
    setBusy(true);
    setError("");
    try {
      const r = await action();
      if (r.error) throw r.error;
      done?.();
      await qc.invalidateQueries({ queryKey: ["shop-admin", tenant?.id] });
      await qc.invalidateQueries({ queryKey: ["shop-catalog", tenant?.id] });
    } catch (e: any) {
      setError(
        e.code === "PGRST116"
          ? "Xogtu waa isbeddashay ama ma lihid oggolaansho. Dib u eeg oo isku day mar kale."
          : e.message,
      );
      await qc.invalidateQueries({ queryKey: ["shop-admin", tenant?.id] });
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p>Sug...</p>;
  if (!enabled) return <p>Super Admin ayaa tenant-kan u furi kara eCommerce.</p>;
  return (
    <div className="shop-admin space-y-4">
      <style>{`
        .shop-admin { font-family: Arial, Helvetica, sans-serif; max-width: 900px; margin: auto; }
        .shop-admin .admin-tabs { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); background:hsl(var(--card)); border-bottom:1px solid hsl(var(--border)); border-radius:0 0 14px 14px; padding:0 4px; }
        .shop-admin .admin-tabs button { position:relative; padding:16px 2px; font-size:13px; }
        .shop-admin .admin-tabs button[aria-current=page] { color:hsl(var(--primary)); font-weight:700; }
        .shop-admin .admin-tabs button[aria-current=page]:after { content:""; position:absolute; bottom:0; left:12px; right:12px; height:3px; border-radius:4px 4px 0 0; background:hsl(var(--primary)); }
        .shop-admin h1 { font-size:24px; line-height:30px; font-weight:800; letter-spacing:-.6px; }
        .shop-admin input,.shop-admin select,.shop-admin textarea { border-radius:10px; background:hsl(var(--card)); min-height:40px; font-size:14px; }
        .shop-admin label { font-size:13px; }
        .shop-admin label input,.shop-admin label select { margin-top:5px; }
        .shop-admin .admin-card,.shop-admin > details { background:hsl(var(--card)); border:1px solid hsl(var(--border)); border-radius:14px; padding:14px; box-shadow:0 2px 5px #142b5c08; }
        .shop-admin .admin-row > div:last-child:not(.flex-1) { flex-direction:column; gap:4px; }
        .shop-admin .admin-row > div:last-child:not(.flex-1) button { height:26px; padding:3px 7px; font-size:11px; }
        .shop-admin .admin-row { display:flex; align-items:center; gap:12px; }
        .shop-admin-thumb { width:52px; height:52px; flex-shrink:0; display:flex; align-items:center; justify-content:center; border-radius:12px; overflow:hidden; background:hsl(var(--muted)); color:hsl(var(--primary)); }
        .shop-admin-thumb img { width:100%; height:100%; object-fit:contain; background:white; }
        .shop-admin .admin-badge { border-radius:99px; padding:4px 9px; font-size:11px; white-space:nowrap; background:#e9edf6; color:#42516b; }
        .shop-admin .admin-badge[data-tone=green] { background:#dcfce7; color:#166534; }
        .shop-admin .admin-badge[data-tone=amber] { background:#fff0cd; color:#92400e; }
        .shop-admin .admin-badge[data-tone=red] { background:#fee2e2; color:#991b1b; }
        .shop-admin .admin-badge[data-tone=blue] { background:#dbeafe; color:#1d4ed8; }
        .shop-admin .admin-stat { border:1px solid #dbe6fc; background:#eaf1ff; color:#112653; border-radius:12px; padding:12px; min-width:0; }
        .shop-admin .admin-stat:last-child { background:#fff6e5; border-color:#ffe9c2; }
        .shop-admin .admin-stat svg { width:21px; height:21px; margin-bottom:6px; color:#0757db; }
        .shop-admin .admin-stat p { font-size:12px; }
        .shop-admin .admin-stat strong { font-size:24px; }
        .shop-admin summary { cursor:pointer; font-weight:700; }
        .shop-admin details form { margin-top:14px; border:0; padding:0; }
        .shop-admin .admin-search { position:relative; }
        .shop-admin .admin-search > svg { position:absolute; left:12px; top:12px; width:17px; height:17px; color:#758198; }
        .shop-admin .admin-search input { padding-left:38px; }
      `}</style>
      <nav className="admin-tabs" aria-label="Maamulka Dukaanka">
        {[
          ["categories", "Qaybaha"],
          ["products", "Alaabta"],
          ["stock", "Stock"],
          ["orders", "Dalabyada"],
        ].map(([t, label]) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => navigate(`/dashboard/ecommerce-${t === "products" ? "packages" : t}`)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div>
        <h1>
          {{ categories: "Qaybaha", products: "Alaabta", stock: "Stock", orders: "Dalabyada" }[tab]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {
            {
              categories: "Maamul qaybaha alaabta",
              products: `${query.data?.products.length || 0} alaab oo dukaanka yaalla`,
              stock: "La soco tirada alaabta",
              orders: "La soco dalabyada macaamiisha",
            }[tab]
          }
        </p>
      </div>
      {(tab === "categories" || tab === "products") && (
        <>
          <Button
            className="w-full gap-2"
            disabled={busy || uploading}
            onClick={() => {
              if (tab === "categories") {
                setCategoryId("");
                setCategory("");
                setCategoryImage("");
                openEditor(categoryForm);
              } else {
                setForm(blank);
                openEditor(productForm);
              }
            }}
          >
            <Plus className="h-5 w-5" />
            {tab === "categories" ? "Qayb cusub" : "Alaab cusub"}
          </Button>
          <div className="admin-search">
            <Search />
            <Input
              aria-label="Raadi"
              placeholder={tab === "categories" ? "Raadi qayb..." : "Raadi alaab..."}
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
            />
          </div>
        </>
      )}
      {(error || query.error) && (
        <p role="alert" className="text-destructive">
          {error || String(query.error)}
        </p>
      )}
      {query.isLoading && <p>Sug...</p>}
      {tab === "categories" && (
        <>
          <details ref={categoryForm}>
            <summary>{categoryId ? "Wax ka beddel qaybta" : "Qayb cusub"}</summary>
            <form
              className="admin-card space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (uploading || busy) return;
                void mutate(
                  () =>
                    categoryId
                      ? shopDb
                          .from("shop_categories")
                          .update({ name: category.trim(), image_url: categoryImage })
                          .eq("id", categoryId)
                          .eq("tenant_id", tenant!.id)
                          .select("id")
                          .single()
                      : shopDb
                          .from("shop_categories")
                          .insert({
                            tenant_id: tenant!.id,
                            name: category.trim(),
                            image_url: categoryImage,
                          })
                          .select("id")
                          .single(),
                  () => {
                    setCategory("");
                    setCategoryImage("");
                    setCategoryId("");
                  },
                );
              }}
            >
              <label className="block">
                Magaca qaybta
                <Input
                  required
                  maxLength={100}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </label>
              <ShopImages
                tenantId={tenant!.id}
                value={categoryImage ? [categoryImage] : []}
                onChange={(urls) => setCategoryImage(urls[0] || "")}
                onBusyChange={setUploading}
                disabled={busy || uploading}
              />
              <Button disabled={busy || uploading}>
                {categoryId ? "Kaydi category-ga" : "Ku dar category"}
              </Button>
              {categoryId && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || uploading}
                  onClick={() => {
                    setCategoryId("");
                    setCategory("");
                    setCategoryImage("");
                  }}
                >
                  Ka noqo
                </Button>
              )}
            </form>
          </details>
          {query.data?.categories
            .filter((c: any) => c.name.toLowerCase().includes(catalogSearch.toLowerCase()))
            .map((c: any) => (
              <div className="admin-card admin-row" key={c.id}>
                <Thumb url={c.image_url} name={c.name} />
                <div className="min-w-0 flex-1">
                  <strong className="block break-words text-sm">{c.name}</strong>
                  <p className="text-xs text-muted-foreground">
                    {query.data?.products.filter((p: any) => p.category_id === c.id).length} alaab
                  </p>
                </div>
                <span className="admin-badge" data-tone={c.active ? "green" : "neutral"}>
                  {c.active ? "Muuqda" : "Qarsoon"}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={busy || uploading}
                    onClick={() => {
                      openEditor(categoryForm);
                      setCategoryId(c.id);
                      setCategory(c.name);
                      setCategoryImage(c.image_url);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Wax ka beddel</span>
                  </Button>
                  <Button
                    disabled={busy || uploading}
                    variant="outline"
                    onClick={() =>
                      mutate(() =>
                        shopDb
                          .from("shop_categories")
                          .update({ active: !c.active })
                          .eq("id", c.id)
                          .eq("tenant_id", tenant!.id)
                          .select("id")
                          .single(),
                      )
                    }
                  >
                    {c.active ? "Qari" : "Muuji"}
                  </Button>
                </div>
              </div>
            ))}
        </>
      )}
      {tab === "products" && (
        <>
          <select
            aria-label="Shaandhee qaybta"
            className="w-full rounded-xl border p-2"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Dhammaan qaybaha</option>
            {query.data?.categories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <details ref={productForm}>
            <summary>{form.id ? "Wax ka beddel alaabta" : "Alaab cusub"}</summary>
            <form
              className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (uploading || busy) return;
                const payload = {
                  ...form,
                  tenant_id: tenant!.id,
                  image_urls: productImages(form),
                  price: Number(form.price),
                  stock: Number(form.stock),
                };
                const { id, originalStock, ...values } = payload;
                void mutate(
                  () =>
                    id
                      ? shopDb
                          .from("shop_products")
                          .update(values)
                          .eq("id", id)
                          .eq("tenant_id", tenant!.id)
                          .eq("stock", originalStock)
                          .select("id")
                          .single()
                      : shopDb.from("shop_products").insert(values).select("id").single(),
                  () => {
                    setForm(blank);
                    if (productForm.current) productForm.current.open = false;
                  },
                );
              }}
            >
              <label>
                Magaca
                <Input
                  required
                  maxLength={150}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Qaybta
                <select
                  required
                  className="block w-full rounded-md border bg-background p-2"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">Dooro qayb</option>
                  {query.data?.categories.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qiimaha ($)
                <Input
                  type="number"
                  required
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </label>
              <label>
                Stock
                <Input
                  type="number"
                  required
                  min="0"
                  step="1"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                />
              </label>
              <ShopImages
                tenantId={tenant!.id}
                multiple
                value={productImages(form)}
                onChange={(urls) =>
                  setForm((old) => ({ ...old, image_url: urls[0] || "", image_urls: urls }))
                }
                onBusyChange={setUploading}
                disabled={busy || uploading}
              />
              <label className="sm:col-span-2">
                Faahfaahinta
                <textarea
                  className="block w-full rounded-md border bg-background p-2"
                  maxLength={4000}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <Button disabled={busy || uploading}>
                {form.id ? "Kaydi isbeddelka" : "Ku dar alaab"}
              </Button>
              {form.id && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || uploading}
                  onClick={() => setForm(blank)}
                >
                  Ka noqo
                </Button>
              )}
            </form>
          </details>
          <div className="grid gap-3 sm:grid-cols-2">
            {query.data?.products
              .filter(
                (p: any) =>
                  p.name.toLowerCase().includes(catalogSearch.toLowerCase()) &&
                  (!categoryFilter || p.category_id === categoryFilter),
              )
              .map((p: any) => (
                <div className="admin-card" key={p.id}>
                  <div className="admin-row mb-3">
                    <Thumb url={p.image_url} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <strong className="block break-words text-sm">{p.name}</strong>
                      <p className="text-xs text-muted-foreground">
                        {query.data?.categories.find((c: any) => c.id === p.category_id)?.name}
                      </p>
                      <p className="mt-1 text-xs">
                        <b className="mr-2 text-base">{money(p.price)}</b> Stock: {p.stock}
                      </p>
                    </div>
                    <span className="admin-badge" data-tone={p.active ? "green" : "neutral"}>
                      {p.active ? "Muuqda" : "Qarsoon"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || uploading}
                    onClick={() => (
                      openEditor(productForm),
                      setForm({
                        id: p.id,
                        category_id: p.category_id,
                        name: p.name,
                        description: p.description,
                        image_url: p.image_url,
                        image_urls: productImages(p),
                        price: String(p.price),
                        stock: String(p.stock),
                        originalStock: p.stock,
                        active: p.active,
                      })
                    )}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Wax ka beddel</span>
                  </Button>{" "}
                  <Button
                    variant="outline"
                    disabled={busy || uploading}
                    onClick={() =>
                      mutate(() =>
                        shopDb
                          .from("shop_products")
                          .update({ active: !p.active })
                          .eq("id", p.id)
                          .eq("tenant_id", tenant!.id)
                          .select("id")
                          .single(),
                      )
                    }
                  >
                    {p.active ? "Qari" : "Muuji"}
                  </Button>
                </div>
              ))}
          </div>
        </>
      )}
      {tab === "stock" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="admin-stat">
              <Package />
              <p>Alaabta</p>
              <strong className="text-2xl">{query.data?.products.length || 0}</strong>
            </div>
            <div className="admin-stat">
              <Layers />
              <p>Tirada stock-ga</p>
              <strong className="text-2xl">
                {query.data?.products.reduce((n: number, p: any) => n + p.stock, 0) || 0}
              </strong>
            </div>
            <div className="admin-stat">
              <AlertTriangle />
              <p>Stock dhammaaday</p>
              <strong className="text-2xl">
                {query.data?.products.filter((p: any) => p.stock === 0).length || 0}
              </strong>
            </div>
          </div>
          <Input
            aria-label="Raadi stock"
            placeholder="Raadi alaabta..."
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
          />
          <div className="flex gap-2">
            {[
              ["all", "Dhammaan"],
              ["low", "Yar"],
              ["empty", "Dhammaaday"],
            ].map(([v, l]) => (
              <Button
                key={v}
                variant={stockFilter === v ? "default" : "outline"}
                onClick={() => setStockFilter(v)}
              >
                {l}
              </Button>
            ))}
          </div>
          {query.data?.products
            .filter(
              (p: any) =>
                p.name.toLowerCase().includes(stockSearch.toLowerCase()) &&
                (stockFilter === "all" ||
                  (stockFilter === "empty" ? p.stock === 0 : p.stock > 0 && p.stock <= 5)),
            )
            .map((p: any) => (
              <form
                key={p.id}
                className="admin-card flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (uploading || busy) return;
                  const draft = stockEdits[p.id];
                  if (!draft) return;
                  const stock = Number(draft.value);
                  if (!Number.isInteger(stock) || stock < 0) return;
                  void mutate(
                    () =>
                      shopDb
                        .from("shop_products")
                        .update({ stock })
                        .eq("id", p.id)
                        .eq("tenant_id", tenant!.id)
                        .eq("stock", draft.expected)
                        .select("id")
                        .single(),
                    () =>
                      setStockEdits((old) => {
                        const next = { ...old };
                        delete next[p.id];
                        return next;
                      }),
                  );
                }}
              >
                <Thumb url={p.image_url} name={p.name} />
                <div className="min-w-0 flex-1">
                  <strong>{p.name}</strong>
                  <p>
                    {money(p.price)} · {p.active ? "Muuqda" : "Qarsoon"}
                  </p>
                  <p className={p.stock === 0 ? "text-destructive" : "text-muted-foreground"}>
                    Hadda: {p.stock}
                  </p>
                </div>
                <span
                  className="admin-badge"
                  data-tone={p.stock === 0 ? "red" : p.stock <= 5 ? "amber" : "green"}
                >
                  {p.stock === 0 ? "Dhammaaday" : p.stock <= 5 ? "Yar" : "Diyaar"}
                </span>
                <label className="basis-1/2">
                  Stock cusub
                  <Input
                    className="w-28"
                    type="number"
                    required
                    min="0"
                    step="1"
                    max="2147483647"
                    value={stockEdits[p.id]?.value ?? String(p.stock)}
                    onChange={(e) =>
                      setStockEdits((old) => ({
                        ...old,
                        [p.id]: { value: e.target.value, expected: old[p.id]?.expected ?? p.stock },
                      }))
                    }
                  />
                </label>
                <Button disabled={busy || !stockEdits[p.id]}>Kaydi</Button>
                {stockEdits[p.id] && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setStockEdits((old) => {
                        const next = { ...old };
                        delete next[p.id];
                        return next;
                      })
                    }
                  >
                    Ka noqo
                  </Button>
                )}
              </form>
            ))}
          {query.data?.products.length === 0 && <p>Marka hore alaab ku dar Packages / Alaabta.</p>}
        </>
      )}
      {tab === "orders" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["received", "Cusub", Package],
              ["progress", "Socda", RefreshCw],
              ["delivered", "La keenay", CheckCircle2],
            ].map(([status, label, Icon]: any) => (
              <div key={status} className="admin-stat">
                <Icon />
                <p>{label}</p>
                <strong>
                  {query.data?.orders.filter((o: any) =>
                    status === "progress"
                      ? ["preparing", "dispatched"].includes(o.status)
                      : o.status === status,
                  ).length || 0}
                </strong>
              </div>
            ))}
          </div>
          <div className="admin-search">
            <Search />
            <Input
              aria-label="Raadi dalab"
              placeholder="Raadi dalab..."
              value={orderSearch}
              onChange={(e) => setOrderSearch(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            100-ka dalab ee ugu dambeeyay · Lacag-bixinta: marka la keeno
          </p>
          <label className="block">
            Xaaladda dalabka
            <select
              className="ml-3 rounded-md border bg-background p-2"
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
            >
              <option value="all">Dhammaan</option>
              {Object.entries(orderStatuses).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {query.data?.orders.length === 0 && <p>Weli dalab ma jiro.</p>}
          {query.data?.orders
            .filter(
              (o: any) =>
                (orderFilter === "all" || o.status === orderFilter) &&
                `${o.id} ${o.customer_name} ${o.phone}`
                  .toLowerCase()
                  .includes(orderSearch.toLowerCase()),
            )
            .map((o: any) => (
              <article key={o.id} className="admin-card space-y-3">
                <div className="flex justify-between font-bold">
                  <span>#{o.id.slice(0, 8)}</span>
                  <span>{money(o.total)}</span>
                </div>
                <p>
                  {o.customer_name} · {o.phone}
                </p>
                <p>{o.address}</p>
                <p>{new Date(o.created_at).toLocaleString()}</p>
                {o.items.map((i: any) => (
                  <p key={i.product_id}>
                    {i.name} × {i.quantity}
                  </p>
                ))}
                <span
                  className="admin-badge inline-block"
                  data-tone={
                    o.status === "delivered"
                      ? "green"
                      : o.status === "cancelled"
                        ? "red"
                        : o.status === "received"
                          ? "amber"
                          : "blue"
                  }
                >
                  {orderStatuses[o.status as keyof typeof orderStatuses]}
                </span>
                {!["delivered", "cancelled"].includes(o.status) && (
                  <div className="flex gap-2">
                    <Button
                      disabled={busy || uploading}
                      onClick={() => {
                        const next = {
                          received: "preparing",
                          preparing: "dispatched",
                          dispatched: "delivered",
                        }[o.status as "received"];
                        void mutate(() =>
                          shopDb
                            .from("shop_orders")
                            .update({ status: next })
                            .eq("id", o.id)
                            .eq("tenant_id", tenant!.id)
                            .select("id")
                            .single(),
                        );
                      }}
                    >
                      <span className="sr-only">Tallaabada xigta: </span>
                      {
                        {
                          received: "Diyaari dalabka",
                          preparing: "Dir dalabka",
                          dispatched: "Xaqiiji gaarsiinta",
                        }[o.status as "received"]
                      }
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy || uploading}
                      onClick={() => {
                        if (window.confirm("Ma joojinaysaa dalabkan? Stock-ga waa la celinayaa."))
                          void mutate(() =>
                            shopDb
                              .from("shop_orders")
                              .update({ status: "cancelled" })
                              .eq("id", o.id)
                              .eq("tenant_id", tenant!.id)
                              .select("id")
                              .single(),
                          );
                      }}
                    >
                      Jooji
                    </Button>
                  </div>
                )}
              </article>
            ))}
        </>
      )}
    </div>
  );
}
