import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Link2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface AutoTopUpPackage {
  id: string;
  topup_number_id: string;
  package_name: string;
  selling_price: number;
  data_amount: string;
  provider_name: string;
  is_active: boolean;
}

interface DeliveryRule {
  id: string;
  source_package_id: string;
  target_package_id: string;
  delivery_count: number;
  delay_minutes: number;
  execution_order: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export const AutoTopUpDeliveryRules = () => {
  const { language } = useLanguage();
  const [packages, setPackages] = useState<AutoTopUpPackage[]>([]);
  const [rules, setRules] = useState<DeliveryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Form state
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [deliveryCount, setDeliveryCount] = useState('1');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [executionOrder, setExecutionOrder] = useState('1');
  const [notes, setNotes] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [pkgRes, rulesRes] = await Promise.all([
      supabase.from('auto_topup_packages').select('*').eq('is_active', true).order('package_name'),
      supabase.from('auto_topup_delivery_rules').select('*').order('execution_order'),
    ]);
    setPackages((pkgRes.data as AutoTopUpPackage[]) || []);
    setRules((rulesRes.data as DeliveryRule[]) || []);
    setLoading(false);
  };

  const getPkgLabel = (id: string) => {
    const pkg = packages.find(p => p.id === id);
    return pkg ? `${pkg.package_name} ($${pkg.selling_price})` : id.slice(0, 8);
  };

  const addRule = async () => {
    if (!sourceId || !targetId) return;
    setAdding(true);
    const { error } = await supabase.from('auto_topup_delivery_rules').insert({
      source_package_id: sourceId,
      target_package_id: targetId,
      delivery_count: parseInt(deliveryCount) || 1,
      delay_minutes: parseInt(delayMinutes) || 0,
      execution_order: parseInt(executionOrder) || 1,
      notes: notes.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Rule waa lagu daray' : 'Rule added' });
      setSourceId('');
      setTargetId('');
      setDeliveryCount('1');
      setDelayMinutes('0');
      setExecutionOrder('1');
      setNotes('');
      loadData();
    }
    setAdding(false);
  };

  const toggleRule = async (id: string, currentActive: boolean) => {
    await supabase.from('auto_topup_delivery_rules').update({ is_active: !currentActive }).eq('id', id);
    loadData();
  };

  const deleteRule = async (id: string) => {
    await supabase.from('auto_topup_delivery_rules').delete().eq('id', id);
    loadData();
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-blue-500" />
          {language === 'so' ? 'Xirmooyin Isku Xiran (Delivery Rules)' : 'Package Bundling Rules'}
        </CardTitle>
        <CardDescription>
          {language === 'so'
            ? 'Marka package la iibsado, package kale oo dheeraad ah si toos ah ha la geeyo. Tusaale: 1GB iibsashada → 500MB oo dheeraad ah.'
            : 'When a package is purchased, automatically deliver additional packages. Example: buying 1GB → also deliver 500MB bonus.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {packages.length < 2 ? (
          <p className="text-muted-foreground text-sm text-center py-2">
            {language === 'so' ? 'Ugu yaraan 2 package ayaad u baahan tahay si aad rule u abuurto' : 'Need at least 2 packages to create rules'}
          </p>
        ) : (
          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-medium">{language === 'so' ? 'Rule cusub ku dar' : 'Add new rule'}</p>
            <div className="grid grid-cols-1 gap-2">
              <div>
                <Label className="text-xs">{language === 'so' ? 'Xirmada La Iibsaday (Source)' : 'Source Package'}</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={language === 'so' ? 'Dooro...' : 'Select...'} /></SelectTrigger>
                  <SelectContent>
                    {packages.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.package_name} (${p.selling_price}) - {p.provider_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{language === 'so' ? 'Xirmada La Geynayo (Target)' : 'Target Package'}</Label>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={language === 'so' ? 'Dooro...' : 'Select...'} /></SelectTrigger>
                  <SelectContent>
                    {packages.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.package_name} (${p.selling_price}) - {p.provider_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">{language === 'so' ? 'Inta jeer' : 'Count'}</Label>
                <Input type="number" value={deliveryCount} onChange={e => setDeliveryCount(e.target.value)} className="h-8 text-sm" min="1" />
              </div>
              <div>
                <Label className="text-xs">{language === 'so' ? 'Sugitaan (daq.)' : 'Delay (min)'}</Label>
                <Input type="number" value={delayMinutes} onChange={e => setDelayMinutes(e.target.value)} className="h-8 text-sm" min="0" />
              </div>
              <div>
                <Label className="text-xs">{language === 'so' ? 'Tartibka' : 'Order'}</Label>
                <Input type="number" value={executionOrder} onChange={e => setExecutionOrder(e.target.value)} className="h-8 text-sm" min="1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">{language === 'so' ? 'Faallo' : 'Notes'}</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={language === 'so' ? 'Ikhtiyaari...' : 'Optional...'} className="h-8 text-sm" />
            </div>
            <Button size="sm" onClick={addRule} disabled={adding || !sourceId || !targetId} className="w-full">
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {language === 'so' ? 'Ku dar Rule' : 'Add Rule'}
            </Button>
          </div>
        )}

        {rules.length === 0 ? (
          <p className="text-muted-foreground text-center py-4 text-sm">
            {language === 'so' ? 'Wali rule ma jiro' : 'No delivery rules yet'}
          </p>
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className="flex items-start justify-between bg-muted/50 rounded-md p-3 text-sm">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{language === 'so' ? 'Asal' : 'Source'}</Badge>
                    <span className="font-medium truncate">{getPkgLabel(rule.source_package_id)}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className="text-xs bg-primary/10">{language === 'so' ? 'Bartilmaameed' : 'Target'}</Badge>
                    <span className="font-medium truncate">{getPkgLabel(rule.target_package_id)}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {rule.delivery_count}x · {rule.delay_minutes} {language === 'so' ? 'daq.' : 'min'} · #{rule.execution_order}
                    {rule.notes && ` · ${rule.notes}`}
                  </div>
                </div>
                <div className="flex gap-1 ml-2 shrink-0">
                  <Badge
                    variant={rule.is_active ? 'default' : 'secondary'}
                    className="text-xs cursor-pointer"
                    onClick={() => toggleRule(rule.id, rule.is_active)}
                  >
                    {rule.is_active ? 'ON' : 'OFF'}
                  </Badge>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
