import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useShop, shopDb } from "./useShop";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Headset, Plus, Save, Trash2 } from "lucide-react";
import { Link } from "@/lib/router-compat";
import ShopPaymentLogo from "./ShopPaymentLogo";

export type ShopPaymentMethod = {
  id: string;
  provider: string;
  number: string;
  enabled: boolean;
  logo_url?: string;
};

type CheckoutConfig = {
  payment_provider: string;
  payment_number: string;
  payment_methods: ShopPaymentMethod[];
  support_whatsapp: string;
  support_call: string;
};

const empty: CheckoutConfig = {
  payment_provider: "EVC Plus",
  payment_number: "",
  payment_methods: [],
  support_whatsapp: "",
  support_call: "",
};
const normalizedPhone = (phone: string) => phone.trim().replace(/[\s()-]/g, "");
const validPhone = (phone: string) => !phone || /^\+?[0-9]{7,15}$/.test(phone);

function configuredMethods(settings: CheckoutConfig): ShopPaymentMethod[] {
  if (Array.isArray(settings.payment_methods) && settings.payment_methods.length) {
    return settings.payment_methods.map(method => ({ ...method, enabled: method.enabled !== false }));
  }
  return settings.payment_number
    ? [{ id: "legacy", provider: settings.payment_provider || "EVC Plus", number: settings.payment_number, enabled: true }]
    : [];
}

export default function ShopCheckoutSettings() {
  const { tenant, enabled } = useShop();
  const qc = useQueryClient();
  const [form, setForm] = useState<CheckoutConfig>(empty);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["shop-checkout-settings", tenant?.id],
    enabled: !!tenant?.id && enabled,
    queryFn: async () => {
      const { data, error } = await shopDb
        .from("shop_checkout_settings")
        .select("payment_provider,payment_number,payment_methods,support_whatsapp,support_call")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data as CheckoutConfig | null;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!query.isSuccess) return;
    const current = query.data ?? empty;
    setForm({ ...current, payment_methods: configuredMethods(current) });
  }, [query.isSuccess, query.data, tenant?.id]);

  function updateMethod(id: string, key: "provider" | "number" | "logo_url", value: string) {
    setForm(old => ({
      ...old,
      payment_methods: old.payment_methods.map(m => m.id === id ? { ...m, [key]: value } : m),
    }));
  }

  function setMethodEnabled(id: string, enabled: boolean) {
    setForm(old => ({
      ...old,
      payment_methods: old.payment_methods.map(m => m.id === id ? { ...m, enabled } : m),
    }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || busy) return;
    const methods = form.payment_methods.map(m => ({
      id: m.id,
      provider: m.provider.trim(),
      number: normalizedPhone(m.number),
      enabled: m.enabled !== false,
      logo_url: m.logo_url?.trim() || "",
    }));
    const primary = methods.find(method => method.enabled);
    const next: CheckoutConfig = {
      ...form,
      payment_provider: primary?.provider || "EVC Plus",
      payment_number: primary?.number || "",
      payment_methods: methods,
      support_whatsapp: normalizedPhone(form.support_whatsapp),
      support_call: normalizedPhone(form.support_call),
    };

    if (methods.length > 8 ||
      new Set(methods.map(m => m.id)).size !== methods.length ||
      methods.some(m => !/^[a-zA-Z0-9_-]{1,72}$/.test(m.id) ||
        !m.provider || m.provider.length > 60 ||
        !validPhone(m.number) || !m.number ||
        (m.logo_url && !/^https:\/\/[^\s]+$/i.test(m.logo_url))) ||
      !validPhone(next.support_whatsapp) || !validPhone(next.support_call)) {
      toast({
        title: "Hubi hababka lacag-bixinta",
        description: "Magacyada iyo lambarada sax; adeeg kasta waa inuu leeyahay lambar (7–15 digits).",
        variant: "destructive",
      });
      return;
    }

    setBusy(true);
    try {
      const { error } = await shopDb.from("shop_checkout_settings")
        .upsert({ tenant_id: tenant.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
      if (error) throw error;
      setForm(next);
      // Immediately deliver saved options to the storefront when both views are open.
      // The server stays authoritative; invalidate to re-check after cache update.
      qc.setQueryData(["shop-checkout-settings", tenant.id], next);
      await qc.invalidateQueries({ queryKey: ["shop-checkout-settings", tenant.id] });
      toast({ title: "Hababka lacag-bixinta waa la kaydiyay" });
    } catch (error: any) {
      toast({ title: "Lama kaydin", description: error.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (query.isLoading) return <p className="p-4 text-sm">Settings waa la soo akhrinayaa...</p>;
  if (query.isError) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-destructive/30 p-4 text-sm">
        <p>Settings lama soo akhrin karo. {String(query.error)}</p>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>Isku day mar kale</Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <CreditCard className="h-5 w-5" /> Shirkadaha lacag-bixinta
          </h2>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={busy || form.payment_methods.length >= 8}
            onClick={() => setForm(old => ({
              ...old,
              payment_methods: [...old.payment_methods, { id: crypto.randomUUID(), provider: "", number: "", enabled: true, logo_url: "" }],
            }))}
          >
            <Plus className="h-4 w-4" /> Ku dar shirkad
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Shirkad cusub markaad ku darto, si toos ah ON ayay u noqonaysaa.
          Marka aad kaydiso, isla markiiba waxay ka muuqanaysaa popup-ka macaamilka.
          Shirkad kasta waad xiri kartaa (OFF) si aysan u muuqan.
        </p>

        <datalist id="shop-payment-providers">
          <option value="EVC Plus" />
          <option value="eDahab" />
          <option value="Premier Wallet" />
          <option value="Sahal" />
          <option value="ZAAD" />
        </datalist>

        {form.payment_methods.map((method, index) => (
          <div key={method.id} className="space-y-3 rounded-2xl border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShopPaymentLogo provider={method.provider} logoUrl={method.logo_url} size="sm" />
                <strong>Shirkadda {index + 1}</strong>
              </div>
              <div className="flex items-center gap-3">
                <label htmlFor={`shop-method-${method.id}`} className="text-sm font-semibold">
                  {method.enabled ? "ON — Furan" : "OFF — Xiran"}
                </label>
                <Switch
                  id={`shop-method-${method.id}`}
                  checked={method.enabled !== false}
                  onCheckedChange={checked => setMethodEnabled(method.id, checked)}
                  aria-label={`Shirkadda ${index + 1} ON ama OFF`}
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1 text-destructive"
                aria-label={`Ka saar shirkadda ${index + 1}`}
                onClick={() => setForm(old => ({
                  ...old,
                  payment_methods: old.payment_methods.filter(m => m.id !== method.id),
                }))}
              >
                <Trash2 className="h-4 w-4" /> Ka saar
              </Button>
            </div>
            <label className="block space-y-1 text-sm">
              Shirkadda / Payment method
              <Input
                list="shop-payment-providers"
                maxLength={60}
                required
                placeholder="EVC Plus, eDahab, Premier Wallet..."
                value={method.provider}
                onChange={e => updateMethod(method.id, "provider", e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              Lambarka lacagta lagu dirayo
              <Input
                type="tel"
                inputMode="tel"
                maxLength={25}
                required
                placeholder="61xxxxxxx ama +25261xxxxxxx"
                value={method.number}
                onChange={e => updateMethod(method.id, "number", e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              Logo URL (ikhtiyaari)
              <Input
                type="url"
                maxLength={500}
                placeholder="https://.../logo.png"
                value={method.logo_url || ""}
                onChange={e => updateMethod(method.id, "logo_url", e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                EVC Plus, eDahab, ZAAD iyo Jeeb waxay leeyihiin logo diyaarsan.
              </span>
            </label>
          </div>
        ))}

        {form.payment_methods.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Weli shirkad lacag-bixin ah kuma darin. Ku dar shirkad si macaamiishu u dooran karaan.
          </p>
        )}
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          EVC Plus (61/77): lacag-dirista USSD waxaa la diyaarin karaa marka
          lambarka merchant-ka iyo wadarta dalabku sax yihiin.
          eDahab ama shirkad kale ON ah: waxaa la tusayaa lambarka lacag-dirista;
          koodh USSD aan la xaqiijin si toos ah looma furo.
          Shirkad OFF ah macaamilka uma muuqanayso. Furitaanka dialer-ka
          ma aha caddeyn in lacagtu dhacday.
        </p>
      </section>

      <section className="admin-card space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Headset className="h-5 w-5" /> Support — FAB
        </h2>
        <p className="text-sm text-muted-foreground">
          Lambarada WhatsApp iyo Call ee floating support button-ka waxaa laga maamulaa
          Settings → App Settings.
        </p>
        <Link to="/dashboard/app-settings" className="inline-flex text-sm font-semibold text-primary underline">
          Tag FAB WhatsApp & Call Settings
        </Link>
      </section>

      <Button type="submit" className="w-full gap-2" disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? "Waa la kaydinayaa..." : "Kaydi hababka lacag-bixinta"}
      </Button>
    </form>
  );
}
