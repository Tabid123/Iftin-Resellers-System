import { Smartphone, LayoutDashboard, ShoppingBag } from 'lucide-react'
import CachedImage from '@/components/CachedImage'

interface Props {
  name: string
  logoUrl?: string | null
  primary?: string | null
  accent?: string | null
}

/** Normalize a user-entered color into a valid CSS color string. */
function toCss(value?: string | null, fallback = '#3D0066'): string {
  if (!value) return fallback
  const v = value.trim()
  if (!v) return fallback
  if (v.startsWith('#')) return v
  // assume HSL components like "276 100% 20%"
  if (/\d/.test(v) && v.includes('%')) return `hsl(${v})`
  return v
}

/** Pick a readable foreground color for a given background hex/HSL. */
function readableOn(bg: string): string {
  // try to parse hex; if hsl(...) fall back to white
  if (bg.startsWith('#')) {
    const hex = bg.replace('#', '')
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luma > 0.55 ? '#111' : '#fff'
  }
  return '#fff'
}

export default function ThemePreview({ name, logoUrl, primary, accent }: Props) {
  const p = toCss(primary, '#3D0066')
  const a = toCss(accent, '#C5F82A')
  const onP = readableOn(p)
  const onA = readableOn(a)
  const displayName = name || 'Reseller'

  const Logo = () =>
    logoUrl ? (
      <CachedImage src={logoUrl} alt={`${displayName} logo`} className="h-8 w-8 rounded object-contain bg-white p-0.5" />
    ) : (
      <div
        className="h-8 w-8 rounded grid place-items-center font-bold text-xs"
        style={{ background: a, color: onA }}
      >
        {displayName.slice(0, 2).toUpperCase()}
      </div>
    )

  return (
    <div className="grid md:grid-cols-3 gap-3">
      {/* 1. Login / splash */}
      <div className="rounded-xl overflow-hidden border bg-card">
        <div className="px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b bg-muted/50">
          <Smartphone className="h-3.5 w-3.5" /> Login
        </div>
        <div
          className="aspect-[9/16] flex flex-col items-center justify-center gap-4 p-4"
          style={{ background: p, color: onP }}
        >
          {logoUrl ? (
            <CachedImage src={logoUrl} alt={`${displayName} logo`} className="h-20 w-20 rounded-2xl object-contain bg-white p-1" />
          ) : (
            <div className="h-20 w-20 rounded-2xl grid place-items-center font-bold text-2xl"
              style={{ background: a, color: onA }}>
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="text-center">
            <div className="font-bold text-lg">{displayName}</div>
            <div className="text-xs opacity-80">Geli lambarkaaga taleefanka</div>
          </div>
          <div className="w-full max-w-[180px] space-y-2">
            <div className="h-9 rounded-md bg-white/15 border border-white/30" />
            <button
              className="w-full h-9 rounded-md text-sm font-semibold"
              style={{ background: a, color: onA }}
            >
              Sii wad
            </button>
          </div>
        </div>
      </div>

      {/* 2. Admin sidebar */}
      <div className="rounded-xl overflow-hidden border bg-card">
        <div className="px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b bg-muted/50">
          <LayoutDashboard className="h-3.5 w-3.5" /> Admin
        </div>
        <div className="aspect-[9/16] flex">
          <div className="w-1/3 p-2 flex flex-col gap-1" style={{ background: p, color: onP }}>
            <div className="flex items-center gap-1.5 px-1 py-2">
              <Logo />
              <div className="text-[10px] font-bold truncate">{displayName}</div>
            </div>
            {['Dashboard', 'Orders', 'Customers', 'Sims', 'Reports'].map((label, i) => (
              <div
                key={label}
                className="text-[10px] px-2 py-1.5 rounded"
                style={i === 0 ? { background: a, color: onA, fontWeight: 600 } : { opacity: 0.8 }}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="flex-1 p-2 bg-background space-y-2">
            <div className="text-[10px] font-semibold">Dashboard</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded p-1.5 text-[9px]" style={{ background: p + '20' }}>
                <div className="opacity-60">Orders</div>
                <div className="font-bold" style={{ color: p }}>248</div>
              </div>
              <div className="rounded p-1.5 text-[9px]" style={{ background: a + '40' }}>
                <div className="opacity-60">Revenue</div>
                <div className="font-bold">$1.2k</div>
              </div>
            </div>
            <div className="rounded border h-12" />
            <div className="rounded border h-10" />
          </div>
        </div>
      </div>

      {/* 3. Customer storefront */}
      <div className="rounded-xl overflow-hidden border bg-card">
        <div className="px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b bg-muted/50">
          <ShoppingBag className="h-3.5 w-3.5" /> Storefront
        </div>
        <div className="aspect-[9/16] bg-background">
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: p, color: onP }}>
            <Logo />
            <div className="text-xs font-semibold flex-1 truncate">{displayName}</div>
          </div>
          <div className="p-2 space-y-2">
            <div className="text-[10px] font-semibold">Doorashada Providers</div>
            <div className="grid grid-cols-2 gap-1.5">
              {['Hormuud', 'Somtel', 'Somnet', 'Amtel'].map(n => (
                <div key={n} className="rounded border p-2 text-center">
                  <div className="h-6 w-6 rounded-full mx-auto mb-1"
                    style={{ background: p, color: onP, fontSize: 9, display: 'grid', placeItems: 'center' }}>
                    {n[0]}
                  </div>
                  <div className="text-[9px]">{n}</div>
                </div>
              ))}
            </div>
            <button
              className="w-full h-8 rounded-md text-[11px] font-semibold"
              style={{ background: a, color: onA }}
            >
              Iibso
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
