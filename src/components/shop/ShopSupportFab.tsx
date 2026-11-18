import { useState } from "react";
import { Headphones, MessageCircle, Phone, X } from "lucide-react";

export function supportPhoneE164(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (raw.startsWith("+")) return "+" + digits;
  if (digits.startsWith("252")) return "+" + digits;
  if (digits.length === 9) return "+252" + digits;
  if (digits.length === 10 && digits.startsWith("0")) return "+252" + digits.slice(1);
  return "+" + digits;
}

export default function ShopSupportFab({
  whatsapp,
  call,
}: {
  whatsapp: string;
  call: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const wa = supportPhoneE164(whatsapp);
  const tel = supportPhoneE164(call);
  if (!wa && !tel) return null;

  return (
    <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[60] flex flex-col items-end gap-3">
      {expanded && (
        <div id="shop-support-actions" className="flex flex-col items-end gap-2">
          {wa && (
            <a
              href={"https://wa.me/" + wa.slice(1)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp support"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg"
            >
              <MessageCircle className="h-5 w-5" /> WhatsApp
            </a>
          )}
          {tel && (
            <a
              href={"tel:" + tel}
              aria-label="Call support"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg"
            >
              <Phone className="h-5 w-5" /> Call
            </a>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded(open => !open)}
        aria-label={expanded ? "Xir support" : "Fur support"}
        aria-expanded={expanded}
        aria-controls="shop-support-actions"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
      >
        {expanded ? <X className="h-6 w-6" /> : <Headphones className="h-6 w-6" />}
      </button>
    </div>
  );
}
