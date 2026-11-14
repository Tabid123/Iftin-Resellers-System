import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop, shopDb, money, orderStatuses } from "./useShop";
import { useNavigate } from "@/lib/router-compat";
const blank = {
  id: "",
  category_id: "",
  name: "",
  description: "",
  image_url: "",
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
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Maamulka Dukaanka</h1>
      <p className="text-sm text-muted-foreground">
        Milkiilaha tenant-ka ayaa maamula alaabta iyo dalabyada. Furista/xirista eCommerce waxaa leh
        Super Admin.
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          ["categories", "Categories"],
          ["products", "Packages / Alaabta"],
          ["stock", "Stock"],
          ["orders", "Dalabyada"],
        ].map(([t, label]) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            onClick={() => navigate(`/dashboard/ecommerce-${t === "products" ? "packages" : t}`)}
          >
            {label}
          </Button>
        ))}
      </div>
      {(error || query.error) && (
        <p role="alert" className="text-destructive">
          {error || String(query.error)}
        </p>
      )}
      {query.isLoading && <p>Sug...</p>}
      {tab === "categories" && (
        <>
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(e) => {
              e.preventDefault();
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
            <label className="block">
              Sawirka (HTTPS URL)
              <Input
                type="url"
                pattern="https://.*"
                value={categoryImage}
                onChange={(e) => setCategoryImage(e.target.value)}
              />
            </label>
            <Button disabled={busy}>{categoryId ? "Kaydi category-ga" : "Ku dar category"}</Button>
            {categoryId && (
              <Button
                type="button"
                variant="outline"
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
          {query.data?.categories.map((c: any) => (
            <div className="flex items-center justify-between rounded-xl border p-3" key={c.id}>
              <span>
                {c.name} {!c.active && "(Qarsoon)"}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setCategoryId(c.id);
                    setCategory(c.name);
                    setCategoryImage(c.image_url);
                  }}
                >
                  Wax ka beddel
                </Button>
                <Button
                  disabled={busy}
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
          <form
            className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const payload = {
                ...form,
                tenant_id: tenant!.id,
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
                () => setForm(blank),
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
            <label className="sm:col-span-2">
              Sawirka (HTTPS URL)
              <Input
                type="url"
                pattern="https://.*"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </label>
            <label className="sm:col-span-2">
              Faahfaahinta
              <textarea
                className="block w-full rounded-md border bg-background p-2"
                maxLength={4000}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <Button disabled={busy}>{form.id ? "Kaydi isbeddelka" : "Ku dar alaab"}</Button>
            {form.id && (
              <Button type="button" variant="outline" onClick={() => setForm(blank)}>
                Ka noqo
              </Button>
            )}
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            {query.data?.products.map((p: any) => (
              <div className="space-y-2 rounded-xl border p-4" key={p.id}>
                <strong>{p.name}</strong>
                <p>
                  {money(p.price)} · Stock: {p.stock} · {p.active ? "Muuqda" : "Qarsoon"}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    setForm({
                      id: p.id,
                      category_id: p.category_id,
                      name: p.name,
                      description: p.description,
                      image_url: p.image_url,
                      price: String(p.price),
                      stock: String(p.stock),
                      originalStock: p.stock,
                      active: p.active,
                    })
                  }
                >
                  Wax ka beddel
                </Button>{" "}
                <Button
                  variant="outline"
                  disabled={busy}
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p>Alaabta</p>
              <strong className="text-2xl">{query.data?.products.length || 0}</strong>
            </div>
            <div className="rounded-xl border p-4">
              <p>Tirada stock-ga</p>
              <strong className="text-2xl">
                {query.data?.products.reduce((n: number, p: any) => n + p.stock, 0) || 0}
              </strong>
            </div>
            <div className="rounded-xl border p-4">
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
          <p className="text-sm text-muted-foreground">
            Geli tirada guud ee hadda diyaar ah. Dalab cusub haddii uu stock-ga beddelo inta aad wax
            ka beddelayso, kaydinta waa la joojinayaa si tirada saxda ah loo ilaaliyo.
          </p>
          {query.data?.products
            .filter((p: any) => p.name.toLowerCase().includes(stockSearch.toLowerCase()))
            .map((p: any) => (
              <form
                key={p.id}
                className="flex flex-wrap items-end gap-3 rounded-xl border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
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
                <div className="min-w-40 flex-1">
                  <strong>{p.name}</strong>
                  <p>
                    {money(p.price)} · {p.active ? "Muuqda" : "Qarsoon"}
                  </p>
                  <p className={p.stock === 0 ? "text-destructive" : "text-muted-foreground"}>
                    Hadda: {p.stock}
                  </p>
                </div>
                <label>
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
          <p>100-ka dalab ee ugu dambeeyay · Lacag-bixinta: marka la keeno</p>
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
            .filter((o: any) => orderFilter === "all" || o.status === orderFilter)
            .map((o: any) => (
              <article key={o.id} className="space-y-3 rounded-xl border p-4">
                <strong>
                  #{o.id.slice(0, 8)} · {money(o.total)}
                </strong>
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
                <p>{orderStatuses[o.status as keyof typeof orderStatuses]}</p>
                {!["delivered", "cancelled"].includes(o.status) && (
                  <div className="flex gap-2">
                    <Button
                      disabled={busy}
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
                      Tallaabada xigta
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={busy}
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
