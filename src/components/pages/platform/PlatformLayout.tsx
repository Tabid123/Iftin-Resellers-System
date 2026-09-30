import { useEffect, useState } from 'react'
import { platformSupabase as supabase, supabase as tenantSupabase } from '@/integrations/supabase/client'
import { NavLink, Outlet, useNavigate } from "@/lib/router-compat"
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Loader2, LogOut, Users, Package, BarChart3, Smartphone, Menu, PanelLeftClose, Moon, Sun } from 'lucide-react'
import PlatformAuth from './PlatformAuth'
import iftinLogo from '@/assets/iftin-resellers-brand.jpg'

export default function PlatformLayout() {
  const navigate = useNavigate()
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
    const check = async () => {
      let { data: { session } } = await supabase.auth.getSession()

      // One-time migration from the old shared auth storage. After this,
      // platform and tenant-admin sessions are completely independent.
      if (!session) {
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

      if (!mounted) return
      if (!session) {
        setAuthed(false); setIsSuper(false); setEmail(''); setLoading(false); return
      }

      const { data: roles } = await supabase
        .from('user_roles').select('role').eq('user_id', session.user.id)
      const sa = (roles ?? []).some((r: any) => r.role === 'super_admin')
      setAuthed(true)
      setEmail(session.user.email ?? '')
      setIsSuper(sa)
      setLoading(false)
    }
    check()
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => { mounted = false; sub.subscription.unsubscribe() }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f6f3]">
        <Loader2 className="h-8 w-8 animate-spin text-[#0b5ed7]" />
      </div>
    )
  }

  if (!authed || !isSuper) {
    return <PlatformAuth onSuccess={() => window.location.reload()} authed={authed} />
  }

  const navItems = [
    { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
    { to: '/admin/resellers', label: 'Resellers', icon: Users },
    { to: '/admin/plans', label: 'Plans', icon: Package },
    { to: '/admin/apps', label: 'Apps', icon: Smartphone },
  ]

  const signOut = async () => { await supabase.auth.signOut(); navigate(0) }

  const togglePlatformTheme = () => {
    setPlatformDark((current) => {
      const next = !current
      try { localStorage.setItem('iftin:platform-theme', next ? 'dark' : 'light') } catch {}
      return next
    })
  }

  const SidebarBody = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex h-full flex-col bg-[#0c1220] text-slate-200">
      <div className="flex h-[62px] items-center justify-between border-b border-white/5 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white">
            <img src={iftinLogo} alt="Iftin Resellers" className="h-7 w-7 object-contain" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold tracking-tight text-white">Iftin Resellers</div>
            <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Super Admin</div>
          </div>
        </div>
        <PanelLeftClose className="hidden h-4 w-4 text-slate-500 lg:block" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              'group relative flex h-9 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors ' +
              (isActive
                ? 'bg-[#1a2230] text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white')
            }
          >
            {({ isActive }: { isActive: boolean }) => (
              <>
                {isActive ? <span className="absolute -left-3 h-6 w-[3px] rounded-r-full bg-[#ff7a00]" /> : null}
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
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

  return (
    <div className={`platform-shell flex min-h-screen w-full overflow-x-hidden bg-[#f7f6f3] text-slate-950 ${platformDark ? 'platform-dark' : ''}`}>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[216px] shrink-0 border-r border-black/10 bg-[#0c1220] lg:flex lg:flex-col">
        <SidebarBody />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[216px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-black/5 bg-[#f7f6f3]/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Fur menu-ka" className="border-black/10 bg-white">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[216px] border-0 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <SidebarBody onNavigate={() => setMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={iftinLogo} alt="Iftin Resellers" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0 truncate text-sm font-semibold">Iftin Resellers</div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden bg-[#f7f6f3]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
