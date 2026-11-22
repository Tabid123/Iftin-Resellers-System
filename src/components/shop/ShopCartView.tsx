import { useState } from "react";
import {
  ArrowRight, CheckCircle2, ChevronRight, CreditCard, MapPin,
  Minus, Package, Plus, ShoppingBag, Store, Trash2, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { money } from "./useShop";
import ShopPaymentInstructions from "./ShopPaymentInstructions";
import {
  normalizedPayerPhone,
  shopMethodDialHref,
  ShopPaymentOption,
  validPayerPhone,
} from "./shopPaymentOptions";

export type ShopCartProduct = {
  id: string;
  name: string;
  image_url: string;
  price: number;
  stock: number;
};

export type ShopOrderPaymentReceipt = {
  id: string;
  provider: string;
  number: string;
  total: number;
};

type Props = {
  items: { product: ShopCartProduct; quantity: number }[];
  unavailable: boolean;
  methods: ShopPaymentOption[];
  loadingMethods: boolean;
  methodsError: boolean;
  onRetryMethods: () => void;
  onQuantity: (product: ShopCartProduct, delta: number) => void;
  onRemoveUnavailable: () => void;
  onClear: () => void;
  onViewOrders: () => void;
  onPlaceOrder: (details: {
    methodKey: string;
    name: string;
    phone: string;
    address: string;
  }) => Promise<ShopOrderPaymentReceipt>;
};

function CartThumbnail({ product }: { product: ShopCartProduct }) {
  return /^https:\/\//.test(product.image_url || "") ? (
    <img
      src={product.image_url}
      alt={product.name}
      loading="lazy"
      className="h-24 w-24 shrink-0 rounded-xl bg-background object-contain p-1"
    />
  ) : (
    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-primary/10">
      <ShoppingBag className="h-11 w-11 text-primary" />
    </div>
  );
}

export default function ShopCartView({
  items, unavailable, methods, loadingMethods, methodsError,
  onRetryMethods, onQuantity, onRemoveUnavailable, onClear, onViewOrders, onPlaceOrder,
}: Props) {
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [methodKey, setMethodKey] = useState("");
  const [methodOpen, setMethodOpen] = useState(false);
  const [payerOpen, setPayerOpen] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [payerNumber, setPayerNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ShopOrderPaymentReceipt | null>(null);
  const [dialAttempted, setDialAttempted] = useState(false);
  const selected = methods.find(m => m.id === methodKey);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const invalidStock = items.some(item => item.quantity > item.product.stock);
  const canOrder = count > 0 && !unavailable && !invalidStock && !loadingMethods && !methodsError;
  const receiptDialHref = receipt ? shopMethodDialHref(receipt.provider, receipt.number, receipt.total) : null;

  function openPayer() {
    setError("");
    if (!selected) {
      setMethodOpen(true);
      return;
    }
    if (!name.trim() || name.trim().length > 100) {
      setError("Geli magaca qofka dalbanaya.");
      return;
    }
    if (fulfillment === "delivery" && address.trim().length < 5) {
      setError("Geli cinwaan sax ah oo alaabta lagu keenayo.");
      return;
    }
    if (!canOrder) {
      setError("Hubi alaabta, stock-ga iyo hababka lacag-bixinta.");
      return;
    }
    setPayerOpen(true);
  }

  async function confirmPayer() {
    if (!selected || busy || !validPayerPhone(selected.provider, payerNumber)) return;
    setBusy(true);
    setError("");
    try {
      const saved = await onPlaceOrder({
        methodKey: selected.id,
        name: name.trim(),
        phone: normalizedPayerPhone(payerNumber),
        address: fulfillment === "pickup"
          ? "Pickup - ka qaado dukaanka"
          : address.trim(),
      });
      setReceipt(saved);
      setPayerOpen(false);
      // The transaction has only been registered, not paid or confirmed.
      // Opening a dialer never marks an order as paid.
      const href = shopMethodDialHref(saved.provider, saved.number, saved.total);
      if (href) {
        setDialAttempted(true);
        // Some embedded browsers may require the fallback link below.
        window.location.assign(href);
      }
    } catch (cause: any) {
      setError(cause?.message || "Dalabka lama diiwaangelin. Isku day mar kale.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section className="space-y-5">
        <div className="rounded-2xl border bg-card p-5 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
          <h2 className="mt-3 text-xl font-extrabold">Dalabka waa la diiwaangeliyay</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Lacagta weli lama xaqiijin. Dukaanka ayaa hubinaya wareejinta.
          </p>
          <p className="mt-3 text-2xl font-extrabold text-primary">{money(receipt.total)}</p>
        </div>
        <ShopPaymentInstructions provider={receipt.provider} number={receipt.number} amount={receipt.total} showDialButton={false} />
        <p className="text-center text-xs font-semibold text-destructive">
          Haddii aad hore lacagta u dirtay, mar labaad ha bixin.
        </p>
        {receiptDialHref && (
          <a
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground"
            href={receiptDialHref}
            onClick={() => setDialAttempted(true)}
          >
            {dialAttempted ? "Mar kale fur dialer-ka" : "Fur dialer-ka"}
            <ArrowRight className="h-5 w-5" />
          </a>
        )}
        {!receiptDialHref && (
          <p className="rounded-xl border bg-muted/40 p-3 text-sm">
            Adeeggan ma laha koodh USSD oo la xaqiijiyey. Ka isticmaal app-ka
            shirkadda ama ku dir lacagta lambarka kor ku qoran.
          </p>
        )}
        <Button type="button" variant="outline" className="w-full" onClick={onViewOrders}>
          La soco dalabka
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-5 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Dambiisha ({count} alaab)</h2>
          <p className="text-xs text-muted-foreground">Hubi alaabta ka hor intaadan bixin.</p>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-sm font-semibold text-muted-foreground underline underline-offset-4"
          >
            <Trash2 className="h-4 w-4" /> Nadiifi
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/70 p-1">
        {([
          ["delivery", "Delivery", Truck],
          ["pickup", "Pickup", Store],
        ] as const).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setFulfillment(mode)}
            aria-pressed={fulfillment === mode}
            className={
              "flex min-h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors " +
              (fulfillment === mode ? "bg-card text-primary shadow-sm" : "text-muted-foreground")
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </button>
        ))}
      </div>

      {unavailable && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-sm">
          <p>Qaar ka mid ah alaabtu hadda lama heli karo.</p>
          <Button type="button" variant="outline" onClick={onRemoveUnavailable}>Ka saar alaabta maqan</Button>
        </div>
      )}

      <div className="space-y-3">
        {items.map(({ product, quantity }) => (
          <article key={product.id} className="rounded-2xl border bg-card p-3 shadow-sm">
            <div className="flex gap-3">
              <CartThumbnail product={product} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-primary">Alaabta dukaanka</p>
                <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{product.name}</h3>
                <strong className="mt-2 block text-lg font-extrabold">{money(product.price * quantity)}</strong>
                <div className="mt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground"
                    aria-label={"Yaree " + product.name}
                    onClick={() => onQuantity(product, -1)}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-4 text-center text-sm font-bold">{quantity}</span>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
                    aria-label={"Kordhi " + product.name}
                    disabled={quantity >= product.stock}
                    onClick={() => onQuantity(product, 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            {quantity > product.stock && <p role="alert" className="mt-2 text-xs text-destructive">Stock-ga: {product.stock}. Yaree tirada.</p>}
          </article>
        ))}
        {!count && <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">Dambiishaadu waa madhan tahay.</p>}
      </div>

      {count > 0 && (
        <>
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {fulfillment === "pickup" ? "Pickup Details" : "Delivery Details"}
            </h3>
            <div className="space-y-3 rounded-2xl border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-primary" />
                {fulfillment === "pickup" ? "Ka qaado dukaanka" : "Goobta alaabta lagu keenayo"}
              </div>
              <label className="block space-y-1 text-sm">
                Magaca
                <Input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Magaca macaamilka" />
              </label>
              {fulfillment === "delivery" && (
                <label className="block space-y-1 text-sm">
                  Cinwaanka
                  <Input required minLength={5} maxLength={500} value={address} onChange={e => setAddress(e.target.value)} placeholder="Xaafadda, jidka iyo faahfaahin" />
                </label>
              )}
              {fulfillment === "pickup" && (
                <p className="text-xs text-muted-foreground">Dukaanka ayaa kula xaqiijinaya goobta alaabta laga qaadanayo.</p>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bill Details</h3>
            <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm shadow-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Item total</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{fulfillment === "pickup" ? "Pickup" : "Delivery fee"}</span>
                <span>{fulfillment === "pickup" ? "Dukaanka" : "Waxaa la xaqiijinayaa"}</span>
              </div>
              <div className="border-t pt-3">
                <div className="flex items-center justify-between text-base font-extrabold">
                  <span>To pay (alaabta)</span>
                  <span className="text-lg text-primary">{money(total)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Khidmad gaarsiin oo aan la xaqiijin kuma jirto wadartan.</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <button
              type="button"
              onClick={() => setMethodOpen(true)}
              disabled={loadingMethods || methodsError || methods.length === 0}
              className="flex min-h-14 w-full items-center justify-between gap-2 rounded-2xl border bg-card p-4 text-left shadow-sm disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <CreditCard className="h-6 w-6 text-primary" />
                <div>
                  <strong className="block text-sm">{selected ? selected.provider : "Select payment method"}</strong>
                  <p className="text-xs text-muted-foreground">{selected ? "Taabo si aad u beddesho" : "Dooro shirkadda lacag-bixinta"}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>

            {loadingMethods && <p className="text-sm text-muted-foreground">Hababka lacag-bixinta waa la soo akhrinayaa...</p>}
            {methodsError && (
              <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-sm">
                <p>Hababka lacag-bixinta lama soo akhrin karo.</p>
                <Button type="button" variant="outline" onClick={onRetryMethods}>Isku day mar kale</Button>
              </div>
            )}
            {!loadingMethods && !methodsError && methods.length === 0 && (
              <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                Maamulka dukaanku weli ma dejin shirkad lacag-bixin ah.
              </p>
            )}
            {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button
              type="button"
              className="min-h-14 w-full gap-2 rounded-xl text-base font-bold"
              disabled={!canOrder || methods.length === 0}
              onClick={selected ? openPayer : () => setMethodOpen(true)}
            >
              {selected ? "Bixi Hadda" : "Select payment method"}
              <ArrowRight className="h-5 w-5" />
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              PIN-ka lacag-bixinta waligaa ha ku qorin app-kan. Dialer-ka ayaa ku weydiinaya.
            </p>
          </section>
        </>
      )}

      <Dialog open={methodOpen} onOpenChange={setMethodOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dooro shirkadda lacag-bixinta</DialogTitle>
            <DialogDescription>Shirkadaha uu maamulka dukaanku dejiyay oo keliya.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto">
            {methods.map(method => (
              <button
                type="button"
                key={method.id}
                aria-pressed={selected?.id === method.id}
                className={
                  "flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left " +
                  (selected?.id === method.id ? "border-primary bg-primary/5" : "bg-card")
                }
                onClick={() => {
                  setMethodKey(method.id);
                  setMethodOpen(false);
                  setError("");
                }}
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="h-6 w-6 text-primary" />
                  <div>
                    <strong className="block">{method.provider}</strong>
                    <span className="text-xs text-muted-foreground">{method.number}</span>
                  </div>
                </div>
                {selected?.id === method.id && <CheckCircle2 className="h-5 w-5 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={payerOpen} onOpenChange={open => { if (!busy) setPayerOpen(open); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Geli lambarkaaga {selected?.provider || "lacag-bixinta"}</DialogTitle>
            <DialogDescription>
              Lambarkan wuxuu u adeegayaa xiriirka dalabka. Lacagtu waxay ka baxaysaa
              SIM-ka aad ku doorato dialer-ka, ma aha lambar kasta oo halkan lagu qoro.
              PIN-ka ha gelin halkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-primary/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>Shirkadda</span><strong>{selected?.provider}</strong>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span>Wadarta</span><strong>{money(total)}</strong>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Lacagta waxaa loo dirayaa lambarka dukaanka.</p>
            </div>
            <label className="block space-y-1 text-sm">
              {selected?.provider || "Mobile Money"} number
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                autoFocus
                placeholder={/e[\s-]*dahab|somtel/i.test(selected?.provider || "")
                  ? "62xxxxxxx ama +25262xxxxxxx"
                  : /evc|hormuud/i.test(selected?.provider || "")
                    ? "61xxxxxxx ama 77xxxxxxx"
                    : "Geli lambarkaaga"}
                value={payerNumber}
                onChange={e => setPayerNumber(e.target.value)}
                maxLength={20}
              />
            </label>
            {payerNumber && selected && !validPayerPhone(selected.provider, payerNumber) && (
              <p className="text-xs text-destructive">Geli lambar sax ah oo adeeggan ku shaqeeya.</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button
              type="button"
              className="min-h-12 w-full gap-2"
              disabled={busy || !selected || !validPayerPhone(selected.provider, payerNumber)}
              onClick={() => void confirmPayer()}
            >
              {busy ? "Dalabka waa la diiwaangelinayaa..." : "Confirm — Fur dialer-ka"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
