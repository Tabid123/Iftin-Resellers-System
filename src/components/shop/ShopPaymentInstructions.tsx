import { Copy, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export default function ShopPaymentInstructions({
  provider,
  number,
}: {
  provider: string;
  number: string;
}) {
  if (!number) return <p className="text-sm text-muted-foreground">Lacagta waxaa la bixinayaa marka la keeno.</p>;
  return (
    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <h3 className="flex items-center gap-2 font-bold"><CreditCard className="h-5 w-5 text-primary" /> Lacag-bixinta</h3>
      <p className="text-sm">Lacagta ku dir lambarka hoose adigoo isticmaalaya {provider || "Mobile Money"}.</p>
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
      <p className="text-xs text-muted-foreground">
        Fiiro gaar ah: lacag-bixinta si otomaatig ah looma xaqiijiyo. Maamulka dukaanka ayaa hubinaya lacagta.
      </p>
    </div>
  );
}
