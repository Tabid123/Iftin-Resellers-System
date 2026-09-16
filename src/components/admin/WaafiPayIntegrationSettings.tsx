import { useCallback, useEffect, useState } from 'react';
import { CreditCard, EyeOff, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from '@/hooks/use-toast';

type WaafiPayStatus = {
  configured: boolean;
  merchant_uid: string | null;
  api_user_id: string | null;
  environment: 'sandbox' | 'production';
  is_active: boolean;
  has_api_key: boolean;
  updated_at?: string | null;
};

const EMPTY_STATUS: WaafiPayStatus = {
  configured: false,
  merchant_uid: null,
  api_user_id: null,
  environment: 'production',
  is_active: false,
  has_api_key: false,
};

export default function WaafiPayIntegrationSettings() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [status, setStatus] = useState<WaafiPayStatus>(EMPTY_STATUS);
  const [merchantUid, setMerchantUid] = useState('');
  const [apiUserId, setApiUserId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('production');
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const applyStatus = useCallback((next: Partial<WaafiPayStatus> | null | undefined) => {
    const merged = { ...EMPTY_STATUS, ...(next || {}) } as WaafiPayStatus;
    setStatus(merged);
    setMerchantUid(merged.merchant_uid || '');
    setApiUserId(merged.api_user_id || '');
    setEnvironment(merged.environment || 'production');
    setIsActive(merged.is_active === true);
    setApiKey('');
  }, []);

  const callIntegration = useCallback(async (payload: Record<string, unknown>) => {
    if (!tenantId) throw new Error('Tenant lama helin');
    const { data, error } = await supabase.functions.invoke('waafipay-integration', {
      body: { tenant_id: tenantId, ...payload },
    });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || 'WaafiPay integration error');
    }
    return data;
  }, [tenantId]);

  const loadStatus = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await callIntegration({ action: 'status' });
      applyStatus(data?.integration);
    } catch (error: any) {
      toast({
        title: 'WaafiPay status lama soo qaadi karin',
        description: error?.message || 'Fadlan mar kale isku day.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [tenantId, callIntegration, applyStatus]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const save = async () => {
    if (!merchantUid.trim() || !apiUserId.trim()) {
      toast({ title: 'Merchant UID iyo API User ID waa waajib', variant: 'destructive' });
      return;
    }
    if (!status.configured && !apiKey.trim()) {
      toast({ title: 'API Key geli', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const data = await callIntegration({
        action: 'save',
        merchant_uid: merchantUid.trim(),
        api_user_id: apiUserId.trim(),
        api_key: apiKey.trim() || undefined,
        environment,
        is_active: isActive,
      });
      applyStatus(data?.integration);
      toast({
        title: 'WaafiPay waa la kaydiyey',
        description: isActive
          ? 'Payment-ka APPROVED noqda ayaa si toos ah delivery-ga u gelaya.'
          : 'Credentials waa kaydsan yihiin; integration-ku weli waa hakad.',
      });
    } catch (error: any) {
      toast({
        title: 'Kaydintu way fashilantay',
        description: error?.message || 'Khalad ayaa dhacay.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm('WaafiPay credentials-ka tenant-kan ma tirtirnaa?')) return;
    setDeleting(true);
    try {
      const data = await callIntegration({ action: 'delete' });
      applyStatus(data?.integration);
      toast({ title: 'WaafiPay credentials waa la tirtiray' });
    } catch (error: any) {
      toast({
        title: 'Tirtiristu way fashilantay',
        description: error?.message || 'Khalad ayaa dhacay.',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-8">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" /> WaafiPay Direct Purchase
              </CardTitle>
              <CardDescription className="mt-1">
                Tenant kasta wuxuu leeyahay merchant credentials u gaar ah.
              </CardDescription>
            </div>
            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
              status.configured && isActive
                ? 'bg-green-100 text-green-700'
                : status.configured
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-700'
            }`}>
              {status.configured && isActive ? 'Active' : status.configured ? 'Paused' : 'Not configured'}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="waafi-merchant">Merchant UID</Label>
              <Input
                id="waafi-merchant"
                value={merchantUid}
                onChange={(event) => setMerchantUid(event.target.value)}
                placeholder="Merchant UID"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waafi-user">API User ID</Label>
              <Input
                id="waafi-user"
                value={apiUserId}
                onChange={(event) => setApiUserId(event.target.value)}
                placeholder="API User ID"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waafi-key">API Key</Label>
            <Input
              id="waafi-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={status.has_api_key
                ? 'API Key waa kaydsan yahay — blank uga tag haddii aadan beddelayn'
                : 'WaafiPay API Key'}
              autoComplete="new-password"
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <EyeOff className="h-3.5 w-3.5" /> API Key-ga browser-ka dib looguma soo celiyo.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="waafi-environment">Environment</Label>
            <select
              id="waafi-environment"
              value={environment}
              onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="sandbox">Sandbox — tijaabo</option>
              <option value="production">Production — lacag dhab ah</option>
            </select>
          </div>

          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Enable WaafiPay payment</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kaliya payment-ka WaafiPay soo celiyo APPROVED ayaa order iyo delivery loo sameeyaa.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} disabled={saving || deleting} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={save} disabled={saving || deleting} className="sm:flex-1">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save WaafiPay
            </Button>
            {status.configured && (
              <Button variant="outline" onClick={remove} disabled={saving || deleting}>
                {deleting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Trash2 className="mr-2 h-4 w-4" />}
                Tirtir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Qiimaha waxaa laga qaataa package-ka tenant-ka, browser-kuna ma beddeli karo. Request kasta wuxuu leeyahay
          idempotency key si payment ama delivery laba jeer uusan u dhicin.
        </p>
      </div>
    </div>
  );
}
