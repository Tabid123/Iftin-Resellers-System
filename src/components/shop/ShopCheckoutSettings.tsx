import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop, shopDb } from "./useShop";
import { toast } from "@/hooks/use-toast";
import { CreditCard, Headset, Save } from "lucide-react";

type CheckoutConfig = {
  payment_provider: string;
  payment_number: string;
  support_whatsapp: string;
  support_call: string;
};
const empty: CheckoutConfig = {
  payment_provider: "EVC Plus",
  payment_number: "",
  support_whatsapp: "",
  support_call: "",
};
const normalizedPhone = (phone: string) => phone.trim().replace(/[\s()-]/g, "");
const validPhone = (phone: string) => !phone || /^\+?[0-9]{7,15}$/.test(phone);

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
        .select("payment_provider,payment_number,support_whatsapp,support_call")
        .eq("tenant_id", tenant!.id)
        .maybeSingle();
      if (error) throw error;
      return data as CheckoutConfig | null;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (query.isSuccess) setForm(query.data ?? empty);
  }, [query.isSuccess, query.data, tenant?.id]);

  const update = (key: keyof CheckoutConfig, value: string) =>
    setForm(previous => ({ ...previous, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!tenant || busy) return;
    const next: CheckoutConfig = {
      payment_provider: form.payment_provider.trim(),
      payment_number: normalizedPhone(form.payment_number),
      support_whatsapp: normalizedPhone(form.support_whatsapp),
      support_call: normalizedPhone(form.support_call),
    };
    if (!next.payment_provider || next.payment_provider.length > 60 ||
      !validPhone(next.payment_number) ||
      !validPhone(next.support_whatsapp) ||
      !validPhone(next.support_call)) {
      toast({ title: "Hubi xogta", description: "Magaca adeegga iyo lambarada (7–15 digits) sax.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await shopDb.from("shop_checkout_settings")
        .upsert({ tenant_id: tenant.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
      if (error) throw error;
      setForm(next);
      await qc.invalidateQueries({ queryKey: ["shop-checkout-settings", tenant.id] });
      toast({ title: "Lacag-bixinta iyo Support waa la kaydiyay" });
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
        <h2 className="flex items-center gap-2 text-lg font-bold"><CreditCard className="h-5 w-5" /> Lacag-bixinta</h2>
        <p className="text-sm text-muted-foreground">
          Ku qor lambarka macaamiishu lacagta ugu dirayaan dukaanka. Lambarku wuxuu ka muuqanayaa Checkout-ka.
        </p>
        <label className="block space-y-1">
          Adeegga lacag-bixinta
          <Input maxLength={60} required placeholder="Tusaale: EVC Plus, eDahab, Premier Wallet"
            value={form.payment_provider} onChange={e => update("payment_provider", e.target.value)} />
        </label>
        <label className="block space-y-1">
          Lambarka lacagta lagu dirayo
          <Input type="tel" inputMode="tel" maxLength={25} placeholder="61xxxxxxx ama +25261xxxxxxx"
            value={form.payment_number} onChange={e => update("payment_number", e.target.value)} />
        </label>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Haddii lambar la geliyo, macaamilku wuxuu arkaa tilmaamaha lacag-dirista.
          Lacag-bixinta si automatic ah looma xaqiijinayo. Haddii lambarku madhan yahay,
          dalabku wuxuu ahaanayaa "Lacagta marka la keeno".
        </p>
      </section>

      <section className="admin-card space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Headset className="h-5 w-5" /> Support — FAB</h2>
        <p className="text-sm text-muted-foreground">
          Macaamilku wuxuu dukaanka ka arkayaa floating button WhatsApp iyo Call. Haddii aad labadan
          bannaan ka tagto, waxaa la isticmaalayaa support phone-ka tenant-ka haddii uu jiro.
        </p>
        <label className="block space-y-1">
          WhatsApp number
          <Input type="tel" inputMode="tel" maxLength={25} placeholder="+25261xxxxxxx"
            value={form.support_whatsapp} onChange={e => update("support_whatsapp", e.target.value)} />
        </label>
        <label className="block space-y-1">
          Call number
          <Input type="tel" inputMode="tel" maxLength={25} placeholder="+25261xxxxxxx"
            value={form.support_call} onChange={e => update("support_call", e.target.value)} />
        </label>
      </section>
      <Button type="submit" className="w-full gap-2" disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? "Waa la kaydinayaa..." : "Kaydi Payment & Support"}
      </Button>
    </form>
  );
}
