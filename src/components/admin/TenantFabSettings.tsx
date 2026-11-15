import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Headset, MessageCircle, Phone, Save } from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { supportPhoneE164 } from '@/components/shop/ShopSupportFab';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type FabContacts = {
  support_whatsapp: string;
  support_call: string;
};

const EMPTY: FabContacts = { support_whatsapp: '', support_call: '' };
const normalizePhone = (value: string) => value.trim().replace(/[\\s()-]/g, '');
const validPhone = (value: string) => !value || /^\\+?[0-9]{7,15}$/.test(value);
const fabDb = supabase as any;

/** Settings for the two buttons of the tenant's existing floating help FAB. */
export default function TenantFabSettings() {
  const { tenant } = useTenant();
  const tenantId = tenant?.id || null;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FabContacts>(EMPTY);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['tenant-fab-contacts', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await fabDb.from('tenant_fab_contacts')
        .select('support_whatsapp,support_call')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw error;
      return (data || EMPTY) as FabContacts;
    },
    staleTime: 10_000,
  });

  useEffect(() => {
    if (query.isSuccess) setForm(query.data || EMPTY);
  }, [query.isSuccess, query.data, tenantId]);

  const setNumber = (key: keyof FabContacts, value: string) =>
    setForm(previous => ({ ...previous, [key]: value }));
  const whatsapp = normalizePhone(form.support_whatsapp);
  const call = normalizePhone(form.support_call);
  const changed = whatsapp !== normalizePhone(query.data?.support_whatsapp || '')
    || call !== normalizePhone(query.data?.support_call || '');

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!tenantId || saving) return;
    if (!validPhone(whatsapp) || !validPhone(call)) {
      toast.error('Lambarka WhatsApp iyo Call waa inuu noqdaa 7–15 digits (ama +252...).');
      return;
    }
    setSaving(true);
    try {
      const { error } = await fabDb.from('tenant_fab_contacts').upsert({
        tenant_id: tenantId,
        support_whatsapp: whatsapp,
        support_call: call,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tenant_id' });
      if (error) throw error;
      setForm({ support_whatsapp: whatsapp, support_call: call });
      await queryClient.invalidateQueries({ queryKey: ['tenant-fab-contacts', tenantId] });
      toast.success('WhatsApp & Call FAB numbers waa la kaydiyey');
    } catch (error: any) {
      toast.error('Lambarrada lama kaydin: ' + (error?.message || 'Isku day mar kale.'));
    } finally {
      setSaving(false);
    }
  }

  if (!tenantId) return null;
  if (query.isLoading) return <Card className="p-5 text-sm">FAB Support settings waa la soo akhrinayaa...</Card>;
  if (query.isError) {
    return (
      <Card className="p-5 space-y-3">
        <p role="alert" className="text-sm text-destructive">Lambarrada FAB lama soo akhrin karo.</p>
        <Button type="button" variant="outline" onClick={() => void query.refetch()}>Mar kale isku day</Button>
      </Card>
    );
  }

  const defaultPhone = tenant?.support_phone || '';
  return (
    <Card className="p-4 sm:p-6">
      <form className="space-y-4" onSubmit={save}>
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold"><Headset className="h-5 w-5" /> FAB — WhatsApp & Call</h3>
          <p className="text-sm text-muted-foreground">
            Halkan ka beddel lambarrada floating support button-ka ee app-ka tenant-kaaga.
            Isbeddelku ma saameeyo tenant-yada kale.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2 text-sm font-medium">
            <span className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp number</span>
            <Input
              type="tel" inputMode="tel" maxLength={25}
              value={form.support_whatsapp}
              onChange={event => setNumber('support_whatsapp', event.target.value)}
              placeholder="+25261xxxxxxx"
              aria-invalid={!validPhone(whatsapp)}
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span className="flex items-center gap-2"><Phone className="h-4 w-4" /> Call number</span>
            <Input
              type="tel" inputMode="tel" maxLength={25}
              value={form.support_call}
              onChange={event => setNumber('support_call', event.target.value)}
              placeholder="+25261xxxxxxx"
              aria-invalid={!validPhone(call)}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Geli 61xxxxxxx ama +25261xxxxxxx. Haddii field bannaan yahay, app-ku
          wuxuu isticmaalaa support phone-ka tenant-ka ({defaultPhone || 'lama dejin'}).
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs">
            {whatsapp && validPhone(whatsapp) && <a className="text-green-700 underline" href={'https://wa.me/' + supportPhoneE164(whatsapp).slice(1)} target="_blank" rel="noopener noreferrer">Tijaabi WhatsApp</a>}
            {call && validPhone(call) && <a className="text-primary underline" href={'tel:' + supportPhoneE164(call)}>Tijaabi Call</a>}
          </div>
          <Button type="submit" disabled={!changed || saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? 'Waa la kaydinayaa...' : 'Kaydi FAB Numbers'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
