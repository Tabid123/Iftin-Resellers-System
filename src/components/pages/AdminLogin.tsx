import { useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useLocation as useTanStackLocation } from "@tanstack/react-router";
import { supabase, setTenantHeader } from '@/integrations/supabase/client';
import {
  decideWorkspace,
  fetchMemberships,
  rememberWorkspace,
  rememberedWorkspace,
} from '@/lib/workspaceMembership';
import { useTenant } from '@/contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Shield, Loader2, AlertTriangle, KeyRound } from 'lucide-react';
import najaxLogo from '@/assets/najax-logo.jpeg';

// TEMPORARY EMERGENCY BYPASS
const EMERGENCY_PIN = '5516';

const AdminLogin = () => {
  const navigate = useNavigate();
  const rawLocation = useTanStackLocation();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended' ? tenantState.tenant : null;

  // Tenant admin URLs must never flash the generic "Admin Admin" screen while
  // TenantContext is hydrating. Keep the tenant-branded splash visible until
  // the matching tenant identity is ready.
  const tenantRouteMatch = rawLocation.pathname.match(/^\/t\/([^/]+)\/dashboard\/login\/?$/);
  const routeTenantSlug = tenantRouteMatch?.[1] ?? null;

  let cachedTenantLogo: string | null = null;
  let cachedTenantName: string | null = null;
  if (routeTenantSlug && !tenant && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`najax.tenant_cache.${routeTenantSlug}`);
      if (raw) {
        const cached = JSON.parse(raw);
        cachedTenantLogo = cached?.logo_url || null;
        cachedTenantName = cached?.name || null;
      }
    } catch {
      // Ignore invalid/blocked storage and keep the neutral fallback below.
    }
  }
  const fallbackTenantName =
    cachedTenantName ||
    (import.meta.env.VITE_TENANT_NAME as string | undefined) ||
    routeTenantSlug ||
    'Iftin Agents';
  const fallbackTenantLogo =
    cachedTenantLogo ||
    (import.meta.env.VITE_TENANT_LOGO_URL as string | undefined) ||
    najaxLogo;

  const brandName = tenant?.name || fallbackTenantName;
  const brandLogo = tenant?.logo_url || fallbackTenantLogo;
  const primary = tenant?.primary_color || '#3D0066';
  const accent = tenant?.accent_color || '#C5F82A';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showEmergencyMode, setShowEmergencyMode] = useState(false);
  const [choices, setChoices] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [emergencyPin, setEmergencyPin] = useState('');

  const isServiceRestricted = (errorMsg: string) => {
    return errorMsg.toLowerCase().includes('restricted') ||
           errorMsg.toLowerCase().includes('quota') ||
           errorMsg.toLowerCase().includes('exceeded') ||
           errorMsg.toLowerCase().includes('fetch') ||
           errorMsg.toLowerCase().includes('network') ||
           errorMsg.toLowerCase().includes('failed to fetch');
  };

  const handleEmergencyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMERGENCY_PIN) {
      toast({ title: 'Khalad', description: 'Emergency PIN lama helin', variant: 'destructive' });
      return;
    }
    if (emergencyPin === EMERGENCY_PIN) {
      // TEMPORARY local session - Supabase xiran yahay
      localStorage.setItem('adminEmergencySession', 'true');
      localStorage.setItem('adminEmergencyTime', Date.now().toString());
      toast({ title: '✅ Guul', description: 'Emergency mode: Admin waa la soo galay' });
      navigate('/dashboard');
    } else {
      toast({ title: 'Khalad PIN', description: 'PIN-ka waa khalad', variant: 'destructive' });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: 'Khalad',
        description: 'Gali email iyo password',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Hubi haddii Supabase xiran yahay (quota/restricted error)
        if (isServiceRestricted(error.message)) {
          setShowEmergencyMode(true);
          toast({
            title: '⚠️ Supabase Xiran',
            description: 'Service waa xiran. Emergency mode isticmaal.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
        throw error;
      }

      // Every membership (no LIMIT, no arbitrary pick) + platform role.
      const [memberships, { data: roleData }] = await Promise.all([
        fetchMemberships(data.user.id),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', data.user.id)
          .in('role', ['admin', 'super_admin'])
          .limit(1)
          .maybeSingle(),
      ]);

      if (memberships.length === 0 && !roleData) {
        await supabase.auth.signOut();
        toast({
          title: 'Ma lihid fasax',
          description: 'Admin ama reseller owner kaliya ayaa geli kara',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const isSuperAdmin = roleData?.role === 'super_admin';
      const decision = decideWorkspace({
        memberships,
        requestedWorkspaceId: tenant?.id ?? null,
        rememberedWorkspaceId: rememberedWorkspace(),
        isSuperAdmin,
      });

      if (decision.status === 'denied') {
        await supabase.auth.signOut();
        toast({
          title: 'Subdomain khalad',
          description: tenant
            ? `Akoonkaagu ma aha kan ${tenant.name}. Fadlan isticmaal subdomain-ka reseller-kaaga.`
            : 'Akoonkaagu ma laha workspace la furo',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (decision.status === 'choose') {
        const { data: rows } = await supabase
          .from('tenants')
          .select('id, name, slug')
          .in('id', decision.options);
        setChoices(
          decision.options.map((id) => {
            const row = (rows ?? []).find((r: any) => r.id === id);
            return { id, name: row?.name ?? id, slug: row?.slug ?? '' };
          }),
        );
        setLoading(false);
        return;
      }

      rememberWorkspace(decision.workspaceId);
      if (!isSuperAdmin) setTenantHeader(decision.workspaceId);

      toast({
        title: 'Guul',
        description: 'Waad soo gashay',
      });

      navigate('/dashboard');


    } catch (error: any) {
      // Haddii connection-ka oo dhan fashilmo (network error)
      if (isServiceRestricted(error.message || '')) {
        setShowEmergencyMode(true);
        toast({
          title: '⚠️ Supabase Xiran',
          description: 'Service ma heli karo. Emergency mode isticmaal.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Khalad',
          description: error.message || 'Wax khalad ah ayaa dhacay',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (
    routeTenantSlug &&
    (
      tenantState.status === 'loading' ||
      tenantState.status === 'platform' ||
      !tenant ||
      tenant.slug.toLowerCase() !== routeTenantSlug.toLowerCase()
    ) &&
    tenantState.status !== 'not_found' &&
    tenantState.status !== 'offline'
  ) {
    const loadingLogo =
      cachedTenantLogo ||
      (import.meta.env.VITE_TENANT_LOGO_URL as string | undefined) ||
      najaxLogo;
    const loadingName =
      cachedTenantName ||
      (import.meta.env.VITE_TENANT_NAME as string | undefined) ||
      routeTenantSlug;

    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-primary">
        <img
          src={loadingLogo}
          alt={loadingName}
          className="h-36 w-36 rounded-2xl object-cover shadow-lg"
          onError={(event) => {
            event.currentTarget.src = najaxLogo;
          }}
        />
        <div className="mt-8 h-9 w-9 animate-spin rounded-full border-[3px] border-accent/30 border-t-accent" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `linear-gradient(135deg, ${primary}20 0%, hsl(var(--background)) 50%, ${accent}20 100%)`,
      }}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-4">
          <div
            className="w-20 h-20 mx-auto rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ backgroundColor: tenant?.logo_url ? 'transparent' : primary }}
          >
            <img
              src={brandLogo}
              alt={`${brandName} Logo`}
              className="w-full h-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = najaxLogo; }}
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-6 w-6" style={{ color: primary }} />
            <CardTitle className="text-2xl">{brandName} Admin</CardTitle>
          </div>
          <CardDescription className="text-center">
            Gal admin dashboard-ka
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {choices.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="text-sm font-semibold">Dooro workspace-ka</div>
              <p className="text-xs text-muted-foreground">
                Akoonkaagu wuxuu ka tirsan yahay in ka badan hal workspace. Mid dooro.
              </p>
              {choices.map((c) => (
                <Button
                  key={c.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    rememberWorkspace(c.id);
                    setTenantHeader(c.id);
                    setChoices([]);
                    navigate('/dashboard');
                  }}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          )}
          {/* Normal login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full text-white" disabled={loading} style={{ backgroundColor: primary }}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Fadlan sug...
                </>
              ) : (
                'Gal'
              )}
            </Button>
          </form>

          {/* Emergency Mode - Supabase xiran yahay */}
          {showEmergencyMode && (
            <div className="border border-destructive/50 rounded-lg p-4 bg-destructive/5 space-y-3">
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                <span className="font-semibold text-sm">Emergency Mode - Supabase Xiran</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Supabase service-ku ma shaqaynayso (quota exceeded). PIN-ka gaar ah ku gal si aad ugu geshid dashboard-ka.
              </p>
              <form onSubmit={handleEmergencyLogin} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="emergency-pin" className="flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    Emergency PIN
                  </Label>
                  <Input
                    id="emergency-pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="PIN gali"
                    value={emergencyPin}
                    onChange={(e) => setEmergencyPin(e.target.value)}
                    required
                    className="border-destructive/50"
                  />
                </div>
                <Button type="submit" variant="destructive" className="w-full">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Emergency Gal
                </Button>
              </form>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
