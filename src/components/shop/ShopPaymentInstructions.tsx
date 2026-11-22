import { Copy, CreditCard, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { evcPlusDialCode, evcPlusDialHref } from "./evcPlusDial";

export default function ShopPaymentInstructions({
  provider,
  number,
  amount,
}: {
  provider: string;
  number: string;
  /** Only supply an amount for an already registered order. */
  amount?: number;
}) {
  if (!number) return <p className="text-sm text-muted-foreground">Lacagta waxaa la bixinayaa marka la keeno.</p>;

  // The direct dial link is only offered for supported Hormuud 61/77 transfers.
  // Merely opening the dialer is not proof of payment.
  const dialCode = amount === undefined ? null : evcPlusDialCode(provider, number, amount);

  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <h3 className="flex items-center gap-2 font-bold"><CreditCard className="h-5 w-5 text-primary" /> Lacag-bixinta</h3>
      <p className="text-sm">Lacagta ku dir lambarka hoose adigoo isticmaalaya {provider || "Mobile Money"}.</p>
      {amount !== undefined && Number.isFinite(amount) && amount > 0 && (
        <p className="text-lg font-extrabold">Wadarta: ${amount.toFixed(2)}</p>
      )}
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
        <div className="min-w-0">
          <span className="block text-xs text-muted-foreground">{provider || "Mobile Money"}</span>
          <strong className="block break-all text-lg">{number}</strong>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 gap-2"
          aria-label="Copy payment number"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(number);
              toast({ title: "Lambarka waa la koobiyeeyay" });
            } catch {
              toast({ title: "Lama koobiyeeyn", description: "Lambarka gacanta ku koobiyee.", variant: "destructive" });
            }
          }}
        >
          <Copy className="h-4 w-4" /> Copy
        </Button>
      </div>
      {dialCode && (
        <div className="space-y-2">
          <a
            href={evcPlusDialHref(dialCode)}
            aria-label="Bixi Hadda adigoo adeegsanaya EVC Plus"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-center font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <PhoneCall className="h-5 w-5" />
            Bixi Hadda — EVC Plus
          </a>
          <p className="text-xs text-muted-foreground">
            Telefoonka ayaa ku furaya koodhka EVC Plus. Taabo wicitaanka haddii loo baahdo,
            hubi magaca qofka lacagta helaya iyo wadarta, kadib geli PIN-kaaga.
          </p>
          <p className="text-xs font-semibold text-destructive">
            Haddii aad hore lacagta u dirtay, mar labaad ha bixin.
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Lacag-bixinta si otomaatig ah looma xaqiijiyo. Maamulka dukaanka ayaa hubinaya lacagta.
        Furitaanka EVC Plus macnaheedu ma aha in lacagta la bixiyay.
      </p>
    </div>
  );
}
