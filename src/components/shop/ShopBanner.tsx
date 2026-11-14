import { ShoppingBag, ArrowRight } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { useShop } from "./useShop";
export default function ShopBanner() {
  const { enabled } = useShop();
  if (!enabled) return null;
  return (
    <Link
      to="/shop"
      className="mx-4 mt-6 flex items-center gap-4 rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary"
    >
      <ShoppingBag className="h-10 w-10" />
      <span className="flex-1">
        <strong className="block text-xl">Dukaanka</strong>
        <span className="text-sm">Alaab tayo leh ka iibso halkan</span>
      </span>
      <span className="flex items-center gap-1 font-semibold">
        Booqo <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
