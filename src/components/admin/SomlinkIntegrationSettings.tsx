import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, EyeOff, Loader2, PlugZap, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SomlinkStatus {
  configured: boolean;
  wallet_phone: string | null;
  is_active: boolean;
  connection_status: 'untested' | 'connected' | 'failed';
  last_tested_at: string | null;
  last_error: string | null;
  has_password: boolean;
}

// Somlink accounts may be phone numbers OR provider-assigned text identifiers.
// Keep existing numeric rules and reject control characters; preserve the actual ID.
function validSomlinkWalletId(value: string) {
  const id = value.trim();
  if (id.length < 3 || id.length > 128 || /[\x00-\x1f\x7f]/.test(id)) return false;
  if (/^\+?[0-9]+$/.test(id)) return /^\+?[0-9]{7,15}$/.test(id);
  return true;
}

function readableSomlinkError(code: string) {
  if (code === 'invalid_wallet_phone' || code === 'invalid_wallet_identifier') {
    return 'Geli Somlink wallet phone ama API identifier-ka saxda ah (tusaale FAANOOLEAPI ama 64xxxxxxx).';
  }
  if (code === 'password_required') return 'Geli Somlink password-ka.';
  if (code === 'super_admin_required') return 'Super Admin oo keliya ayaa Somlink API maamuli kara.';
  return code;
}

const EMPTY_STATUS: SomlinkStatus = {
  configured: false,
  wallet_phone: null,
  is_active: false,
  connection_status: 'untested',
  last_tested_at: null,
  last_error: null,
  has_password: false,
};

export default function SomlinkIntegrationSettings({ tenantId, client }: { tenantId: string; client: typeof supabase }) {
  const [status, setStatus] = useState<SomlinkStatus>(EMPTY_STATUS);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [walletPhone, setWalletPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const applyStatus = useCallback((next: Partial<SomlinkStatus> | null | undefined) => {
    const merged = { ...EMPTY_STATUS, ...(next || {}) } as SomlinkStatus;
    setStatus(merged);
    setWalletPhone(merged.wallet_phone || '');
    setPassword('');
  }, []);

  // Platform admin has a separate authentication session from tenant admin.
  // Use the supplied platform client when configuring another tenant.
  const callIntegration = useCallback(async (payload: Record<string, unknown>) => {
    if (!tenantId) throw new Error('Tenant lama helin');
    const body = { tenant_id: tenantId, ...payload };
    const { data, error } = await client.functions.invoke('somlink-integration', { body });
    if (error || data?.error) {
      let responseBody: any = data;
      // Supabase FunctionsHttpError stores non-2xx JSON in error.context,
      // so error.message alone hides the actionable server error.
      const response = (error as any)?.context;
      if (!responseBody && response && typeof response.json === 'function') {
        try { responseBody = await response.json(); } catch { /* use fallback below */ }
      }
      const serverError = responseBody?.message || responseBody?.error;
      throw new Error(serverError ? readableSomlinkError(String(serverError)) : error?.message || 'Somlink integration error');
    }
    return data;
  }, [client, tenantId]);

  const loadStatus = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await callIntegration({ action: 'status' });
      applyStatus(data?.integration);
      setRuntimeReady(data?.runtime_ready === true);
    } catch (error: any) {
      toast({
        title: 'Somlink status lama soo qaadi karin',
        description: error?.message || 'Fadlan mar kale isku day.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, applyStatus, callIntegration]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const saveCredentials = async (requestedActive = status.is_active, quiet = false) => {
    if (!tenantId) throw new Error('Tenant lama helin');
    if (!walletPhone.trim()) throw new Error('Geli Somlink wallet phone ama API identifier');
    if (!validSomlinkWalletId(walletPhone)) {
      throw new Error(readableSomlinkError('invalid_wallet_identifier'));
    }
    if (!status.configured && !password) throw new Error('Gali Somlink password');

    const data = await callIntegration({
      action: 'save',
      wallet_phone: walletPhone.trim(),
      password: password || undefined,
      is_active: requestedActive,
    });
    applyStatus(data?.integration);
    if (typeof data?.runtime_ready === 'boolean') setRuntimeReady(data.runtime_ready);
    if (!quiet) {
      toast({
        title: 'Somlink waa la kaydiyey',
        description: data?.integration?.connection_status === 'connected'
          ? 'Integration-ka Somlink waa diyaar.'
          : 'Hadda samee Test Connection si xirmooyinka loo furo.',
      });
    }
    return data?.integration as SomlinkStatus;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCredentials(status.is_active);
    } catch (error: any) {
      toast({ title: 'Kaydintu way fashilantay', description: error?.message || 'Khalad ayaa dhacay.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!tenantId) return;
    setTesting(true);
    try {
      // Save any edited wallet/password first. Credential changes automatically
      // disable the integration until this test succeeds.
      const previouslyActive = status.is_active && status.connection_status === 'connected';
      await saveCredentials(false, true);
      // Existing active integrations stay active after a successful retest.
      // A new/unconfigured tenant requires an explicit Enable action.
      const data = await callIntegration({ action: 'test', activate: previouslyActive });
      if (!data?.success) throw new Error(data?.error || 'Somlink connection failed');
      applyStatus(data?.integration);
      setRuntimeReady(data?.runtime_ready === true);
      toast({
        title: 'Connected ✓',
        description: data?.integration?.is_active === true
          ? 'Somlink login waa PASS. Tenant-kan wali waa Active.'
          : data?.runtime_ready === true
          ? 'Somlink login waa PASS. Riix Enable Somlink delivery si tenant-kan loogu shido.'
          : 'Somlink login waa PASS. Delivery runtime-ka server-ka weli lama enable-gareyn, sidaas darteed xirmooyinka waa qarsoon yihiin.',
      });
    } catch (error: any) {
      await loadStatus();
      toast({ title: 'Somlink lama xiriirin', description: error?.message || 'Wallet ama password hubi.', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleActiveChange = async (next: boolean) => {
    if (next && status.connection_status !== 'connected') {
      toast({ title: 'Test Connection marka hore', description: 'Somlink lama enable-gareyn karo ilaa login-ku PASS noqdo.', variant: 'destructive' });
      return;
    }
    if (next && !runtimeReady) {
      toast({ title: 'Delivery runtime ma diyaarsana', description: 'Server-ka Somlink dispatch marka hore waa in production/staging environment-ka loo enable-gareeyo.', variant: 'destructive' });
      return;
    }
    setStatus((prev) => ({ ...prev, is_active: next }));
    setSaving(true);
    try {
      const saved = await saveCredentials(next, true);
      toast({
        title: next ? 'Somlink waa Active' : 'Somlink waa la hakiyey',
        description: next ? 'Macaamiishu hadda way arki karaan xirmooyinka Somlink.' : 'Xirmooyinka Somlink hadda macaamiisha waa laga qariyey.',
      });
      if (saved) setStatus(saved);
    } catch (error: any) {
      await loadStatus();
      toast({ title: 'Isbeddelku ma hirgelin', description: error?.message || 'Khalad ayaa dhacay.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tenantId || !window.confirm('Somlink credentials-ka tenant-kan ma tirtirnaa?')) return;
    setDeleting(true);
    try {
      const data = await callIntegration({ action: 'delete' });
      applyStatus(data?.integration);
      toast({ title: 'Somlink credentials waa la tirtiray', description: 'Somlink API tenant-kan waa disabled.' });
    } catch (error: any) {
      toast({ title: 'Tirtiristu way fashilantay', description: error?.message || 'Khalad ayaa dhacay.', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const connected = status.connection_status === 'connected';
  const failed = status.connection_status === 'failed';

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-8">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><PlugZap className="h-5 w-5" /> Somlink API</CardTitle>
              <CardDescription className="mt-1">{'Somlink API waxaa tenant-kan u xira Super Admin-ka oo keliya.'}</CardDescription>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${connected ? 'bg-green-100 text-green-700' : failed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {connected ? 'Connected' : failed ? 'Failed' : 'Untested'}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="somlink-wallet">Somlink wallet / API identifier</Label>
            <Input
              id="somlink-wallet"
              type="text"
              inputMode="text"
              value={walletPhone}
              onChange={(e) => setWalletPhone(e.target.value)}
              placeholder="FAANOOLEAPI ama 64xxxxxxx"
              autoComplete="off"
              aria-invalid={walletPhone.trim().length > 0 && !validSomlinkWalletId(walletPhone)}
            />
            {walletPhone.trim().length > 0 && !validSomlinkWalletId(walletPhone) && (
              <p className="text-xs text-destructive">Geli lambar 7–15 digits ah ama Somlink API ID qoraal ah (3–128 xaraf).</p>
            )}
            <p className="text-xs text-muted-foreground">Geli aqoonsiga Somlink kuu siisay sida uu yahay; wuxuu noqon karaa lambar ama username.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="somlink-password">Somlink password</Label>
            <Input
              id="somlink-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={status.has_password ? 'Password waa kaydsan yahay — blank uga tag haddii aadan beddelayn' : 'Gali password-ka Somlink'}
              autoComplete="new-password"
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" /> Password-ka browser-ka dib looguma soo celiyo.
            </p>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Enable Somlink delivery</p>
                <p className="mt-1 text-xs text-muted-foreground">Connected + Active marka ay noqoto ayaa xirmooyinka Somlink macaamiisha u muuqdaan.</p>
              </div>
              <Switch checked={status.is_active} onCheckedChange={handleActiveChange} disabled={!connected || !runtimeReady || saving || testing || deleting} />
            </div>
          </div>

          {status.last_error && (
            <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{status.last_error}</span>
            </div>
          )}

          {connected && !runtimeReady && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Somlink login waa PASS, laakiin server delivery runtime-ka weli lama enable-gareyn. Xirmooyinka Somlink macaamiisha way ka qarsoon yihiin ilaa runtime-ku diyaar noqdo.</span>
            </div>
          )}

          {connected && runtimeReady && (
            <div className="flex gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Somlink login iyo delivery runtime waa PASS. Delivery-ga tenant-kan wuxuu isticmaali doonaa wallet-kan oo keliya.</span>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={handleSave} variant="outline" disabled={saving || testing || deleting} className="sm:flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Save Credentials
            </Button>
            <Button onClick={handleTest} disabled={saving || testing || deleting} className="sm:flex-1">
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />} Test Connection
            </Button>
            {status.configured && (
              <Button variant="destructive" onClick={handleDelete} disabled={saving || testing || deleting}>
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Password-ka waxaa server-side loogu kaydiyaa Supabase Vault. Master Template-ku wuxuu clone-gareeyaa Somlink packages iyo bundle IDs oo keliya; wallet/password tenant kale looma gudbinayo.</p>
      </div>
    </div>
  );
}
