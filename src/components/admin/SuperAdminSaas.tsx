import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Building2, CreditCard, Loader2, Package, Plus, RefreshCw, Save, Trash2, Users } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  price_monthly: number;
  max_devices: number;
  max_orders_monthly: number;
  max_admins: number;
  features: string[] | unknown;
  is_active: boolean;
  display_order: number;
};

type Tenant = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  status: string;
  plan_id: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  owner_user_id: string | null;
  notes: string | null;
  subscription_plans?: { name: string; price_monthly: number } | null;
};

type TenantSubscription = {
  id: string;
  tenant_id: string;
  plan_id: string | null;
  period_start: string;
  period_end: string;
  amount: number;
  payment_method: string | null;
  paid_at: string | null;
  notes: string | null;
  tenants?: { name: string; slug: string } | null;
  subscription_plans?: { name: string } | null;
};

const emptyTenantForm = {
  name: '',
  slug: '',
  plan_id: '',
  status: 'trial',
  primary_color: '#3D0066',
  owner_user_id: '',
  notes: '',
};

const emptyPlanForm = {
  name: '',
  price_monthly: '0',
  max_devices: '1',
  max_orders_monthly: '500',
  max_admins: '2',
  features: '',
};

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const monthFromNow = () => {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString();
};

export function SuperAdminSaas() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const isSo = language === 'so';
  const db = supabase as any;

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [subscriptions, setSubscriptions] = useState<TenantSubscription[]>([]);
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planEdits, setPlanEdits] = useState<Record<string, Partial<Plan>>>({});
  const [paymentTenantId, setPaymentTenantId] = useState('');

  const stats = useMemo(() => {
    const activeTenants = tenants.filter((tenant) => tenant.status === 'active').length;
    const trialTenants = tenants.filter((tenant) => tenant.status === 'trial').length;
    const monthlyRevenue = tenants.reduce((total, tenant) => total + Number(tenant.subscription_plans?.price_monthly || 0), 0);
    return { activeTenants, trialTenants, monthlyRevenue };
  }, [tenants]);

  const loadData = async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setIsSuperAdmin(false);
      setLoading(false);
      return;
    }

    const { data: roleData } = await db
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin')
      .maybeSingle();

    setIsSuperAdmin(Boolean(roleData));

    const [plansResult, tenantsResult, subscriptionsResult] = await Promise.all([
      db.from('subscription_plans').select('*').order('display_order', { ascending: true }),
      db.from('tenants').select('*, subscription_plans(name, price_monthly)').order('created_at', { ascending: false }),
      db.from('tenant_subscriptions').select('*, tenants(name, slug), subscription_plans(name)').order('created_at', { ascending: false }).limit(25),
    ]);

    if (plansResult.error || tenantsResult.error || subscriptionsResult.error) {
      toast({
        title: isSo ? 'Xogta lama soo qaadin' : 'Could not load SaaS data',
        description: plansResult.error?.message || tenantsResult.error?.message || subscriptionsResult.error?.message,
        variant: 'destructive',
      });
    }

    setPlans(plansResult.data || []);
    setTenants(tenantsResult.data || []);
    setSubscriptions(subscriptionsResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const createTenant = async () => {
    if (!tenantForm.name.trim() || !tenantForm.slug.trim()) {
      toast({ title: isSo ? 'Magac iyo slug geli' : 'Enter tenant name and slug', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await db.from('tenants').insert({
      name: tenantForm.name.trim(),
      slug: tenantForm.slug.trim().toLowerCase().replace(/\s+/g, '-'),
      plan_id: tenantForm.plan_id || null,
      status: tenantForm.status,
      primary_color: tenantForm.primary_color || '#3D0066',
      owner_user_id: tenantForm.owner_user_id || null,
      notes: tenantForm.notes || null,
      trial_ends_at: tenantForm.status === 'trial' ? monthFromNow() : null,
    });
    setSaving(false);

    if (error) {
      toast({ title: isSo ? 'Tenant lama abuurin' : 'Tenant was not created', description: error.message, variant: 'destructive' });
      return;
    }

    setTenantForm(emptyTenantForm);
    toast({ title: isSo ? 'Tenant waa la abuuray' : 'Tenant created' });
    loadData();
  };

  const createPlan = async () => {
    if (!planForm.name.trim()) {
      toast({ title: isSo ? 'Magaca plan-ka geli' : 'Enter plan name', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await db.from('subscription_plans').insert({
      name: planForm.name.trim(),
      price_monthly: Number(planForm.price_monthly || 0),
      max_devices: Number(planForm.max_devices || 1),
      max_orders_monthly: Number(planForm.max_orders_monthly || 500),
      max_admins: Number(planForm.max_admins || 2),
      features: planForm.features.split('\n').map((feature) => feature.trim()).filter(Boolean),
      display_order: plans.length + 1,
    });
    setSaving(false);

    if (error) {
      toast({ title: isSo ? 'Plan lama abuurin' : 'Plan was not created', description: error.message, variant: 'destructive' });
      return;
    }

    setPlanForm(emptyPlanForm);
    toast({ title: isSo ? 'Plan waa la abuuray' : 'Plan created' });
    loadData();
  };

  const updateTenant = async (tenantId: string, changes: Partial<Tenant>) => {
    const { error } = await db.from('tenants').update(changes).eq('id', tenantId);
    if (error) {
      toast({ title: isSo ? 'Tenant lama cusbooneysiin' : 'Tenant was not updated', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: isSo ? 'Tenant waa la cusbooneysiiyay' : 'Tenant updated' });
    loadData();
  };

  const savePlan = async (plan: Plan) => {
    const edit = planEdits[plan.id] || {};
    const payload = {
      name: edit.name ?? plan.name,
      price_monthly: Number(edit.price_monthly ?? plan.price_monthly),
      max_devices: Number(edit.max_devices ?? plan.max_devices),
      max_orders_monthly: Number(edit.max_orders_monthly ?? plan.max_orders_monthly),
      max_admins: Number(edit.max_admins ?? plan.max_admins),
      is_active: edit.is_active ?? plan.is_active,
    };
    const { error } = await db.from('subscription_plans').update(payload).eq('id', plan.id);
    if (error) {
      toast({ title: isSo ? 'Plan lama cusbooneysiin' : 'Plan was not updated', description: error.message, variant: 'destructive' });
      return;
    }
    setPlanEdits((current) => ({ ...current, [plan.id]: {} }));
    toast({ title: isSo ? 'Plan waa la cusbooneysiiyay' : 'Plan updated' });
    loadData();
  };

  const renewTenant = async (tenant: Tenant) => {
    const selectedPlan = plans.find((plan) => plan.id === tenant.plan_id);
    if (!selectedPlan) {
      toast({ title: isSo ? 'Tenant plan ma laha' : 'Tenant has no plan', variant: 'destructive' });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const periodEnd = monthFromNow();
    const { error } = await db.from('tenant_subscriptions').insert({
      tenant_id: tenant.id,
      plan_id: selectedPlan.id,
      period_start: new Date().toISOString(),
      period_end: periodEnd,
      amount: selectedPlan.price_monthly,
      payment_method: 'manual',
      paid_at: new Date().toISOString(),
      recorded_by: sessionData.session?.user.id || null,
      notes: 'Manual renewal from Super Admin',
    });

    if (error) {
      toast({ title: isSo ? 'Lacag-bixin lama diiwaangelin' : 'Payment was not recorded', description: error.message, variant: 'destructive' });
      return;
    }

    await updateTenant(tenant.id, { status: 'active', current_period_end: periodEnd });
  };

  const deleteTenant = async (tenantId: string) => {
    const { error } = await db.from('tenants').delete().eq('id', tenantId);
    if (error) {
      toast({ title: isSo ? 'Tenant lama tirtirin' : 'Tenant was not deleted', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: isSo ? 'Tenant waa la tirtiray' : 'Tenant deleted' });
    loadData();
  };

  const selectedPaymentTenant = tenants.find((tenant) => tenant.id === paymentTenantId);

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        {isSo ? 'Waa la soo rarayaa...' : 'Loading...'}
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h2 className="text-xl font-semibold">{isSo ? 'Super Admin kaliya' : 'Super Admin only'}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {isSo ? 'Qaybtan waxaa geli kara qof leh role super_admin.' : 'This section requires the super_admin role.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-foreground">
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isSo ? 'Tenants' : 'Tenants'}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{tenants.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isSo ? 'Active' : 'Active'}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.activeTenants}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isSo ? 'Trial' : 'Trial'}</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{stats.trialTenants}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isSo ? 'MRR' : 'MRR'}</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{money.format(stats.monthlyRevenue)}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="tenants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tenants">{isSo ? 'Tenants' : 'Tenants'}</TabsTrigger>
          <TabsTrigger value="plans">{isSo ? 'Plans' : 'Plans'}</TabsTrigger>
          <TabsTrigger value="payments">{isSo ? 'Lacag-bixin' : 'Payments'}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{isSo ? 'Abuur tenant cusub' : 'Create tenant'}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{isSo ? 'Magac' : 'Name'}</Label>
                <Input value={tenantForm.name} onChange={(event) => setTenantForm({ ...tenantForm, name: event.target.value })} placeholder="Tusaale Telecom" />
              </div>
              <div className="space-y-1.5">
                <Label>Slug</Label>
                <Input value={tenantForm.slug} onChange={(event) => setTenantForm({ ...tenantForm, slug: event.target.value })} placeholder="tusaale" />
              </div>
              <div className="space-y-1.5">
                <Label>Plan</Label>
                <Select value={tenantForm.plan_id || 'none'} onValueChange={(value) => setTenantForm({ ...tenantForm, plan_id: value === 'none' ? '' : value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{isSo ? 'Plan la’aan' : 'No plan'}</SelectItem>
                    {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={tenantForm.status} onValueChange={(value) => setTenantForm({ ...tenantForm, status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="past_due">Past due</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isSo ? 'Midab' : 'Primary color'}</Label>
                <Input value={tenantForm.primary_color} onChange={(event) => setTenantForm({ ...tenantForm, primary_color: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{isSo ? 'Owner user id' : 'Owner user id'}</Label>
                <Input value={tenantForm.owner_user_id} onChange={(event) => setTenantForm({ ...tenantForm, owner_user_id: event.target.value })} placeholder="optional" />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <Label>{isSo ? 'Notes' : 'Notes'}</Label>
                <Textarea value={tenantForm.notes} onChange={(event) => setTenantForm({ ...tenantForm, notes: event.target.value })} />
              </div>
              <div className="md:col-span-3">
                <Button onClick={createTenant} disabled={saving}><Plus className="mr-2 h-4 w-4" />{isSo ? 'Abuur tenant' : 'Create tenant'}</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{isSo ? 'Tenants' : 'Tenants'}</CardTitle>
              <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isSo ? 'Shirkad' : 'Tenant'}</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>{isSo ? 'Dhacaya' : 'Renews'}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: tenant.primary_color || '#3D0066' }} />
                          <div>
                            <div className="font-medium">{tenant.name}</div>
                            <div className="text-xs text-muted-foreground">/{tenant.slug}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={tenant.plan_id || 'none'} onValueChange={(value) => updateTenant(tenant.id, { plan_id: value === 'none' ? null : value })}>
                          <SelectTrigger className="min-w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No plan</SelectItem>
                            {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={tenant.status} onValueChange={(value) => updateTenant(tenant.id, { status: value })}>
                          <SelectTrigger className="min-w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="trial">Trial</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="past_due">Past due</SelectItem>
                            <SelectItem value="suspended">Suspended</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tenant.current_period_end ? new Date(tenant.current_period_end).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => renewTenant(tenant)}><CreditCard className="mr-2 h-4 w-4" />Renew</Button>
                          <Button variant="destructive" size="sm" onClick={() => deleteTenant(tenant.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{isSo ? 'Abuur plan cusub' : 'Create plan'}</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-5">
              <Input placeholder="Plan name" value={planForm.name} onChange={(event) => setPlanForm({ ...planForm, name: event.target.value })} />
              <Input type="number" placeholder="Price" value={planForm.price_monthly} onChange={(event) => setPlanForm({ ...planForm, price_monthly: event.target.value })} />
              <Input type="number" placeholder="Devices" value={planForm.max_devices} onChange={(event) => setPlanForm({ ...planForm, max_devices: event.target.value })} />
              <Input type="number" placeholder="Orders" value={planForm.max_orders_monthly} onChange={(event) => setPlanForm({ ...planForm, max_orders_monthly: event.target.value })} />
              <Input type="number" placeholder="Admins" value={planForm.max_admins} onChange={(event) => setPlanForm({ ...planForm, max_admins: event.target.value })} />
              <Textarea className="md:col-span-5" placeholder="Features, one per line" value={planForm.features} onChange={(event) => setPlanForm({ ...planForm, features: event.target.value })} />
              <div className="md:col-span-5"><Button onClick={createPlan} disabled={saving}><Plus className="mr-2 h-4 w-4" />{isSo ? 'Abuur plan' : 'Create plan'}</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{isSo ? 'Plans' : 'Plans'}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Price</TableHead><TableHead>Devices</TableHead><TableHead>Orders</TableHead><TableHead>Admins</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Save</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell><Input value={String(planEdits[plan.id]?.name ?? plan.name)} onChange={(event) => setPlanEdits({ ...planEdits, [plan.id]: { ...planEdits[plan.id], name: event.target.value } })} /></TableCell>
                      <TableCell><Input type="number" value={String(planEdits[plan.id]?.price_monthly ?? plan.price_monthly)} onChange={(event) => setPlanEdits({ ...planEdits, [plan.id]: { ...planEdits[plan.id], price_monthly: Number(event.target.value) } })} /></TableCell>
                      <TableCell><Input type="number" value={String(planEdits[plan.id]?.max_devices ?? plan.max_devices)} onChange={(event) => setPlanEdits({ ...planEdits, [plan.id]: { ...planEdits[plan.id], max_devices: Number(event.target.value) } })} /></TableCell>
                      <TableCell><Input type="number" value={String(planEdits[plan.id]?.max_orders_monthly ?? plan.max_orders_monthly)} onChange={(event) => setPlanEdits({ ...planEdits, [plan.id]: { ...planEdits[plan.id], max_orders_monthly: Number(event.target.value) } })} /></TableCell>
                      <TableCell><Input type="number" value={String(planEdits[plan.id]?.max_admins ?? plan.max_admins)} onChange={(event) => setPlanEdits({ ...planEdits, [plan.id]: { ...planEdits[plan.id], max_admins: Number(event.target.value) } })} /></TableCell>
                      <TableCell><Badge variant={plan.is_active ? 'default' : 'secondary'}>{plan.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right"><Button size="sm" onClick={() => savePlan(plan)}><Save className="mr-2 h-4 w-4" />Save</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>{isSo ? 'Diiwaangeli lacag-bixin' : 'Record payment'}</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="space-y-1.5 md:min-w-80">
                <Label>Tenant</Label>
                <Select value={paymentTenantId || 'none'} onValueChange={(value) => setPaymentTenantId(value === 'none' ? '' : value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose tenant</SelectItem>
                    {tenants.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={!selectedPaymentTenant} onClick={() => selectedPaymentTenant && renewTenant(selectedPaymentTenant)}><CreditCard className="mr-2 h-4 w-4" />{isSo ? 'Renew 30 maalmood' : 'Renew 30 days'}</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{isSo ? 'Lacag-bixintii ugu dambeysay' : 'Recent payments'}</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Tenant</TableHead><TableHead>Plan</TableHead><TableHead>Amount</TableHead><TableHead>Period</TableHead><TableHead>Paid</TableHead></TableRow></TableHeader>
                <TableBody>
                  {subscriptions.map((subscription) => (
                    <TableRow key={subscription.id}>
                      <TableCell>{subscription.tenants?.name || '—'}</TableCell>
                      <TableCell>{subscription.subscription_plans?.name || '—'}</TableCell>
                      <TableCell>{money.format(Number(subscription.amount || 0))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(subscription.period_start).toLocaleDateString()} → {new Date(subscription.period_end).toLocaleDateString()}</TableCell>
                      <TableCell>{subscription.paid_at ? new Date(subscription.paid_at).toLocaleDateString() : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}