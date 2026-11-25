import { useEffect, useRef, useState } from 'react'
import { platformSupabase as supabase, supabase as tenantSupabase } from '@/integrations/supabase/client'
import { NavLink, Outlet } from "@/lib/router-compat"
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Loader2, LogOut, Users, Package, BarChart3, Smartphone, Menu, Moon, Sun, SlidersHorizontal } from 'lucide-react'
import PlatformAuth from './PlatformAuth'
import { warmPlatformPages } from '@/lib/lazyPages'
import { PLATFORM_ICON_URL } from '@/lib/platformBrand'

function PlatformSidebar({
  onNavigate,
  email,
  platformDark,
  togglePlatformTheme,
  signOut,
}: {
  onNavigate?: () => void
  email: string
  platformDark: boolean
  togglePlatformTheme: () => void
  signOut: () => void
}) {
  const navItems = [
      { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
      { to: '/admin/resellers', label: 'Resellers', icon: Users },
      { to: '/admin/plans', label: 'Plans', icon: Package },
      { to: '/admin/features', label: 'Features', icon: SlidersHorizontal },
      { to: '/admin/apps', label: 'Apps', icon: Smartphone },
    ]
  
  return (
    <div className="flex h-full flex-col platform-sidebar bg-gradient-to-b from-[#102445] via-[#0b1a35] to-[#07132a] text-slate-200">
      <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
            <img src={PLATFORM_ICON_URL} alt="Iftin Resellers" className="h-7 w-7 object-contain scale-[1.15]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-bold tracking-tight text-white">Iftin Resellers</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Super Admin</div>
          </div>
        </div>
        
      </div>

      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-6">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              'group relative flex h-12 items-center gap-3 rounded-xl px-4 text-[15px] font-semibold transition-colors ' +
              (isActive
                ? 'bg-[#0758ed] text-white shadow-lg shadow-blue-950/30'
                : 'text-slate-400 hover:bg-white/5 hover:text-white')
            }
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                {isActive ? <span className="absolute left-0 h-6 w-[3px] rounded-r-full bg-orange-400" /> : null}
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mx-4 mb-5 rounded-2xl border border-blue-400/25 bg-gradient-to-br from-blue-900/70 to-slate-950/40 p-4"><div className="text-xs font-semibold uppercase tracking-widest text-blue-300">Platform control</div><div className="mt-2 text-sm font-semibold text-white">Manage your network</div><p className="mt-1 text-xs leading-relaxed text-slate-300">Resellers, subscriptions and apps in one place.</p></div>
      <div className="border-t border-white/10 p-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-2 w-full justify-start text-slate-400 hover:bg-white/5 hover:text-white"
          onClick={togglePlatformTheme}
        >
          {platformDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
          {platformDark ? 'Light mode' : 'Dark mode'}
        </Button>
        <div className="mb-3 min-w-0 px-2">
          <div className="truncate text-xs font-medium text-slate-300">{email || 'Super Admin'}</div>
          <div className="mt-0.5 text-[10px] text-slate-600">Platform administrator</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-slate-400 hover:bg-white/5 hover:text-white"
          onClick={signOut}
        >
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </Button>
      </div>
    </div>
  )
}

export default function PlatformLayout() {
  const refreshAuthRef = useRef<() => void>(() => {})
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [isSuper, setIsSuper] = useState(false)
  const [email, setEmail] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [platformDark, setPlatformDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('iftin:platform-theme') === 'dark'
  })

  useEffect(() => {
    let mounted = true
    let checkNumber = 0
    let migrationAttempted = false
    const scheduled = new Set<ReturnType<typeof setTimeout>>()
    const check = async () => {
      const request = ++checkNumber
      let { data: { session } } = await supabase.auth.getSession()

      // One-time migration from the old shared auth storage. After this,
      // platform and tenant-admin sessions are completely independent.
      if (!session && !migrationAttempted) {
        migrationAttempted = true
        const { data: { session: legacySession } } = await tenantSupabase.auth.getSession()
        if (legacySession?.access_token && legacySession?.refresh_token) {
          const { data: legacyRoles } = await tenantSupabase
            .from('user_roles').select('role').eq('user_id', legacySession.user.id)
          const legacyIsSuper = (legacyRoles ?? []).some((r: any) => r.role === 'super_admin')
          if (legacyIsSuper) {
            const migrated = await supabase.auth.setSession({
              access_token: legacySession.access_token,
              refresh_token: legacySession.refresh_token,
            })
            session = migrated.data.session
          }
        }
      }

      if (!mounted || request !== checkNumber) return
      if (!session) {
        setAuthed(false); setIsSuper(false); setEmail(''); setLoading(false); return
      }

      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', session.user.id)
      if (!mounted || request !== checkNumber) return
      const sa = (roles ?? []).some((r: any) => r.role === 'super_admin')
      setAuthed(true)
      setEmail(session.user.email ?? '')
      setIsSuper(sa)
      setLoading(false)
    }
    refreshAuthRef.current = () => { void check() }
    void check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // Never call an awaited Supabase API from inside the auth-state callback.
      // Schedule the role check after the auth lock has been released.
      const timer = setTimeout(() => {
        scheduled.delete(timer)
        if (mounted) void check()
      }, 0)
      scheduled.add(timer)
    })
    return () => {
      mounted = false
      checkNumber++
      refreshAuthRef.current = () => {}
      scheduled.forEach(clearTimeout)
      sub.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (authed && isSuper) warmPlatformPages()
  }, [authed, isSuper])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3f6fc]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0b5ed7]" />
      </div>
    )
  }

  if (!authed || !isSuper) {
    return <PlatformAuth onSuccess={() => refreshAuthRef.current()} authed={authed} />
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setAuthed(false)
      setIsSuper(false)
      setEmail('')
    }
  }

  const togglePlatformTheme = () => {
    setPlatformDark((current) => {
      const next = !current
      try { localStorage.setItem('iftin:platform-theme', next ? 'dark' : 'light') } catch {}
      return next
    })
  }

  return (
    <div className={`platform-shell flex min-h-screen w-full overflow-x-hidden bg-[#f2f5fb] text-slate-950 ${platformDark ? 'platform-dark' : ''}`}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] shrink-0 border-r border-black/10 bg-[#0c1220] lg:flex lg:flex-col">
        <PlatformSidebar email={email} platformDark={platformDark} togglePlatformTheme={togglePlatformTheme} signOut={signOut} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[240px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-black/5 bg-[#f3f6fc]/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Fur menu-ka" className="border-black/10 bg-white">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] border-0 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <PlatformSidebar email={email} platformDark={platformDark} togglePlatformTheme={togglePlatformTheme} signOut={signOut} onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={PLATFORM_ICON_URL} alt="Iftin Resellers" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 truncate text-sm font-semibold">Iftin Resellers</div>
        </header>

        <header className="platform-topbar sticky top-0 z-30 hidden h-[66px] items-center justify-between border-b border-slate-200 bg-white px-7 lg:flex">
          <div className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><BarChart3 className="h-5 w-5" /></span><div><div className="text-sm font-semibold text-slate-900">Platform management</div><div className="text-xs text-slate-500">Iftin Resellers / Super Admin</div></div></div>
          <div className="flex items-center gap-4"><NavLink to="/admin/resellers" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 hover:border-blue-300"><Users className="h-4 w-4" /> Find a reseller</NavLink><span className="h-9 w-px bg-slate-200" /><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">SA</span><div><div className="text-sm font-bold text-slate-900">Super Admin</div><div className="max-w-[220px] truncate text-xs text-slate-500">{email}</div></div></div></div>
        </header>
        <main className="platform-workspace min-w-0 flex-1 overflow-x-hidden bg-[#f2f5fb]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
