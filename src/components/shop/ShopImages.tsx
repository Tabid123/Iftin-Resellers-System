import { useRef, useState } from "react";
import { Upload, X, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shopDb } from "./useShop";

export function productImages(product: { image_url?: string; image_urls?: string[] }) {
  return [
    ...new Set(
      [product.image_url, ...(product.image_urls || [])].filter(
        (url): url is string => typeof url === "string" && url.startsWith("https://"),
      ),
    ),
  ].slice(0, 8);
}

export default function ShopImages({
  tenantId,
  value,
  onChange,
  multiple = false,
  disabled = false,
  onBusyChange,
}: {
  tenantId: string;
  value: string[];
  onChange: (urls: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const limit = multiple ? 8 : 1;
  async function upload(files: File[]) {
    if (!files.length || uploading || disabled) return;
    setError("");
    if (multiple && value.length + files.length > limit) {
      setError("Ugu badnaan 8 sawir ayaa la gelin karaa.");
      return;
    }
    if (
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024,
      )
    ) {
      setError("Dooro JPG, PNG ama WebP; sawir kasta ugu badnaan 5 MB.");
      return;
    }
    setUploading(true);
    onBusyChange(true);
    let next = multiple ? [...value] : [];
    try {
      for (const file of files.slice(0, limit)) {
        const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
        const path = `${tenantId}/shop/${crypto.randomUUID()}.${ext}`;
        const { error } = await shopDb.storage
          .from("category-images")
          .upload(path, file, { upsert: false, contentType: file.type, cacheControl: "31536000" });
        if (error) throw error;
        const { data } = shopDb.storage.from("category-images").getPublicUrl(path);
        next = [...next, data.publicUrl];
        onChange(next);
      }
    } catch (e: any) {
      setError(`Sawirka lama soo gelin: ${e.message || "Isku day mar kale."}`);
    } finally {
      setUploading(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="space-y-3 sm:col-span-2">
      <p className="text-sm font-medium">{multiple ? "Sawirrada alaabta" : "Sawirka qaybta"}</p>
      <input
        ref={picker}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Dooro sawir"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        disabled={disabled || uploading}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          void upload(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={disabled || uploading || (multiple && value.length >= limit)}
        onClick={() => picker.current?.click()}
      >
        <Upload className="h-4 w-4" />
        {uploading ? "Sawirrada waa la soo gelinayaa..." : "Upload sawir"}
      </Button>
      <p className="text-xs text-muted-foreground">
        JPG, PNG, WebP · 5 MB{multiple ? " · Ilaa 8 sawir" : ""}
      </p>
      <div className="flex flex-wrap gap-3">
        {value.map((src, i) => (
          <div key={src} className="w-24 space-y-1 rounded-xl border p-1">
            <img
              src={src}
              alt={`Sawirka ${i + 1}`}
              className="h-20 w-full rounded-lg bg-white object-contain"
            />
            {multiple && (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1 text-xs text-primary"
                disabled={disabled || uploading}
                onClick={() => onChange([src, ...value.filter((v) => v !== src)])}
              >
                <Star className="h-3 w-3" fill={i === 0 ? "currentColor" : "none"} />
                {i === 0 ? "Ugu weyn" : "Ka dhig weyn"}
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1 text-xs text-destructive"
              disabled={disabled || uploading}
              onClick={() => onChange(value.filter((v) => v !== src))}
            >
              <X className="h-3 w-3" />
              Ka saar
            </button>
          </div>
        ))}
      </div>
      <details>
        <summary className="text-xs text-muted-foreground">Ama geli link sawir</summary>
        <div className="mt-2 flex gap-2">
          <Input
            aria-label="Link sawir"
            placeholder="https://..."
            value={url}
            disabled={disabled || uploading}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              disabled ||
              uploading ||
              !url.trim().startsWith("https://") ||
              (multiple && value.length >= limit)
            }
            onClick={() => {
              onChange(multiple ? [...new Set([...value, url.trim()])] : [url.trim()]);
              setUrl("");
            }}
          >
            Ku dar
          </Button>
        </div>
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function ProductGallery({
  product,
}: {
  product: { image_url?: string; image_urls?: string[]; name: string };
}) {
  const urls = productImages(product);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen && urls.includes(chosen) ? chosen : urls[0];
  if (!selected) return null;
  return (
    <div className="space-y-3">
      <img
        src={selected}
        alt={product.name}
        className="aspect-square w-full rounded-2xl bg-white object-contain"
      />
      {urls.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-1">
          {urls.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`Eeg sawirka ${i + 1}`}
              aria-pressed={selected === src}
              onClick={() => setChosen(src)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 ${selected === src ? "border-primary" : "border-transparent"}`}
            >
              <img src={src} alt="" className="h-full w-full bg-white object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
