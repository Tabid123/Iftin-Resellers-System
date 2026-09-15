import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, Edit, Package, ArrowRight, Clock, Loader2 } from 'lucide-react';

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

interface PackageOption {
  id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  provider_id: string;
  provider_name?: string;
  category_id: string | null;
  category_name?: string;
}

interface ProviderGroup {
  provider_name: string;
  categories: {
    category_name: string;
    packages: PackageOption[];
  }[];
}

export function PackageDeliveryRules() {
  const [rules, setRules] = useState<DeliveryRule[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<DeliveryRule | null>(null);

  // Form state
  const [sourcePackageId, setSourcePackageId] = useState('');
  const [notes, setNotes] = useState('');

  // Cascading select state for source
  const [srcProvider, setSrcProvider] = useState('');
  const [srcCategory, setSrcCategory] = useState('');

  // Multi-target state
  interface TargetEntry {
    id: string; // local key
    provider: string;
    category: string;
    packageId: string;
    deliveryCount: string;
    delayMinutes: string;
    executionOrder: string;
  }
  const makeTarget = (order: number): TargetEntry => ({
    id: crypto.randomUUID(),
    provider: '', category: '', packageId: '',
    deliveryCount: '1', delayMinutes: '0', executionOrder: String(order),
  });
  const [targets, setTargets] = useState<TargetEntry[]>([makeTarget(1)]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [rulesRes, packagesRes] = await Promise.all([
      supabase.from('package_delivery_rules').select('*').order('source_package_id, execution_order'),
      supabase.from('data_packages_config').select('id, package_name, data_amount, selling_price, provider_id, category_id')
    ]);

    if (rulesRes.data) setRules(rulesRes.data);

    if (packagesRes.data) {
      const providerIds = [...new Set(packagesRes.data.map(p => p.provider_id))];
      const categoryIds = [...new Set(packagesRes.data.map(p => p.category_id).filter(Boolean))] as string[];
      
      const [providersRes, categoriesRes] = await Promise.all([
        supabase.from('providers_config').select('id, provider_name').in('id', providerIds),
        categoryIds.length > 0 
          ? supabase.from('package_categories').select('id, category_name').in('id', categoryIds)
          : Promise.resolve({ data: [] })
      ]);

      const providerMap = new Map<string, string>(providersRes.data?.map(p => [p.id, p.provider_name] as [string, string]) || []);
      const categoryMap = new Map<string, string>(categoriesRes.data?.map((c: any) => [c.id, c.category_name] as [string, string]) || []);
      
      setPackages(packagesRes.data.map(p => ({
        ...p,
        provider_name: providerMap.get(p.provider_id) || 'Unknown',
        category_name: p.category_id ? categoryMap.get(p.category_id) || 'Kale' : 'Kale'
      } as PackageOption)));
    }
    setLoading(false);
  };

  const getPackageName = (id: string) => {
    const pkg = packages.find(p => p.id === id);
    return pkg ? `${pkg.provider_name} - ${pkg.package_name} ($${pkg.selling_price})` : id;
  };

  const getPackageShort = (id: string) => {
    const pkg = packages.find(p => p.id === id);
    return pkg ? pkg.package_name : 'Unknown';
  };

  const resetForm = () => {
    setSourcePackageId('');
    setNotes('');
    setEditingRule(null);
    setSrcProvider(''); setSrcCategory('');
    setTargets([makeTarget(1)]);
  };

  const updateTarget = (idx: number, patch: Partial<TargetEntry>) => {
    setTargets(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
  };

  const addTarget = () => {
    setTargets(prev => [...prev, makeTarget(prev.length + 1)]);
  };

  const removeTarget = (idx: number) => {
    if (targets.length <= 1) return;
    setTargets(prev => prev.filter((_, i) => i !== idx));
  };

  const openEdit = (rule: DeliveryRule) => {
    setEditingRule(rule);
    setSourcePackageId(rule.source_package_id);
    setNotes(rule.notes || '');
    const srcPkg = packages.find(p => p.id === rule.source_package_id);
    if (srcPkg) { setSrcProvider(srcPkg.provider_id); setSrcCategory(srcPkg.category_id || ''); }
    const tgtPkg = packages.find(p => p.id === rule.target_package_id);
    setTargets([{
      id: crypto.randomUUID(),
      provider: tgtPkg?.provider_id || '',
      category: tgtPkg?.category_id || '',
      packageId: rule.target_package_id,
      deliveryCount: String(rule.delivery_count),
      delayMinutes: String(rule.delay_minutes),
      executionOrder: String(rule.execution_order),
    }]);
    setShowAddDialog(true);
  };

  const handleSave = async () => {
    if (!sourcePackageId) {
      toast({ title: 'Dooro xirmada source', variant: 'destructive' });
      return;
    }
    const validTargets = targets.filter(t => t.packageId);
    if (validTargets.length === 0) {
      toast({ title: 'Ugu yaraan hal target ku dar', variant: 'destructive' });
      return;
    }

    if (editingRule) {
      const t = validTargets[0];
      const { error } = await supabase.from('package_delivery_rules').update({
        source_package_id: sourcePackageId,
        target_package_id: t.packageId,
        delivery_count: parseInt(t.deliveryCount) || 1,
        delay_minutes: parseInt(t.delayMinutes) || 0,
        execution_order: parseInt(t.executionOrder) || 1,
        notes: notes || null,
      }).eq('id', editingRule.id);
      if (error) {
        toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const rows = validTargets.map(t => ({
        source_package_id: sourcePackageId,
        target_package_id: t.packageId,
        delivery_count: parseInt(t.deliveryCount) || 1,
        delay_minutes: parseInt(t.delayMinutes) || 0,
        execution_order: parseInt(t.executionOrder) || 1,
        notes: notes || null,
      }));
      const { error } = await supabase.from('package_delivery_rules').insert(rows);
      if (error) {
        toast({ title: 'Khalad', description: error.message, variant: 'destructive' });
        return;
      }
    }

    toast({ title: editingRule ? 'Rule la cusbooneysiiyay' : 'Rules cusub la abuuray' });
    setShowAddDialog(false);
    resetForm();
    loadData();
  };

  const toggleActive = async (rule: DeliveryRule) => {
    await supabase.from('package_delivery_rules').update({ is_active: !rule.is_active }).eq('id', rule.id);
    loadData();
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Ma hubtaa inaad tirtirto rule-kan?')) return;
    await supabase.from('package_delivery_rules').delete().eq('id', id);
    toast({ title: 'Rule la tirtiray' });
    loadData();
  };

  const formatDelay = (minutes: number) => {
    if (minutes === 0) return 'Isla markiiba';
    if (minutes < 60) return `${minutes} daqiiqo`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} saac`;
    return `${hours} saac ${mins} daq`;
  };

  // Group packages by provider → category
  const groupedPackages = (() => {
    const providerMap = new Map<string, ProviderGroup>();
    packages.forEach(pkg => {
      const provKey = pkg.provider_id;
      if (!providerMap.has(provKey)) {
        providerMap.set(provKey, { provider_name: pkg.provider_name || 'Unknown', categories: [] });
      }
      const group = providerMap.get(provKey)!;
      let cat = group.categories.find(c => c.category_name === (pkg.category_name || 'Kale'));
      if (!cat) {
        cat = { category_name: pkg.category_name || 'Kale', packages: [] };
        group.categories.push(cat);
      }
      cat.packages.push(pkg);
    });
    return Array.from(providerMap.values());
  })();

  // Group rules by source_package_id
  const groupedRules = rules.reduce((acc, rule) => {
    if (!acc[rule.source_package_id]) acc[rule.source_package_id] = [];
    acc[rule.source_package_id].push(rule);
    return acc;
  }, {} as Record<string, DeliveryRule[]>);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Xirmooyin Isku-xiran (Package Bundling)
              </CardTitle>
              <CardDescription>
                Haddii xirmad lagu dalbado oo aanan USSD code gaar ah lahayn, halkan ku qor sida loo dirayo.
                Tusaale: "Unlimited 2 Maalin" → 2x "Unlimited 24 Saac"
              </CardDescription>
            </div>
            <Button onClick={() => { resetForm(); setShowAddDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Rule Cusub
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedRules).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Wali rule ma jiro. Riix "Rule Cusub" si aad mid u abuurto.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedRules).map(([sourceId, sourceRules]) => (
                <Card key={sourceId} className="border-2 border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-sm">
                        Dalabka: {getPackageName(sourceId)}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground text-sm">
                        {sourceRules.length} delivery{sourceRules.length > 1 ? 's' : ''}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2">
                      {sourceRules.sort((a, b) => a.execution_order - b.execution_order).map((rule) => (
                        <div key={rule.id} className="border rounded-lg p-3 bg-card space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium truncate flex-1">{getPackageName(rule.target_package_id)}</span>
                            <div className="flex items-center gap-1.5">
                              <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}><Edit className="h-3.5 w-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRule(rule.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </div>
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground">
                            <span>#{rule.execution_order}</span>
                            <Badge variant="outline" className="text-[10px] h-5">{rule.delivery_count}x</Badge>
                            <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{formatDelay(rule.delay_minutes)}</span>
                          </div>
                          {rule.notes && <p className="text-[10px] text-muted-foreground truncate">{rule.notes}</p>}
                        </div>
                      ))}
                    </div>
                    {/* Desktop Table View */}
                    <div className="hidden md:block w-full overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Xirmada la dirayo (Target)</TableHead>
                            <TableHead>Imisa mar</TableHead>
                            <TableHead>Sugitaan</TableHead>
                            <TableHead>Xaalad</TableHead>
                            <TableHead>Qoraal</TableHead>
                            <TableHead className="text-right">Ficil</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sourceRules.sort((a, b) => a.execution_order - b.execution_order).map((rule) => (
                            <TableRow key={rule.id}>
                              <TableCell className="font-mono">{rule.execution_order}</TableCell>
                              <TableCell className="font-medium">{getPackageName(rule.target_package_id)}</TableCell>
                              <TableCell><Badge variant="outline">{rule.delivery_count}x</Badge></TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-sm"><Clock className="h-3 w-3" />{formatDelay(rule.delay_minutes)}</div>
                              </TableCell>
                              <TableCell><Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} /></TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{rule.notes || '-'}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => openEdit(rule)}><Edit className="h-4 w-4" /></Button>
                                  <Button variant="ghost" size="icon" onClick={() => deleteRule(rule.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { if (!open) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Rule Wax ka Bedel' : 'Rule Cusub Abuur'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* === SOURCE === */}
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <Label className="text-sm font-semibold">Xirmada macmiilku dalbaday (Source)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Shirkad</Label>
                  <Select value={srcProvider} onValueChange={(v) => { setSrcProvider(v); setSrcCategory(''); setSourcePackageId(''); }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Shirkad..." /></SelectTrigger>
                    <SelectContent>
                      {[...new Map(packages.map(p => [p.provider_id, p.provider_name])).entries()].map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Category</Label>
                  <Select value={srcCategory} onValueChange={(v) => { setSrcCategory(v); setSourcePackageId(''); }} disabled={!srcProvider}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Category..." /></SelectTrigger>
                    <SelectContent>
                      {[...new Map(packages.filter(p => p.provider_id === srcProvider).map(p => [p.category_id || '_none', p.category_name || 'Kale'])).entries()].map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Package</Label>
                  <Select value={sourcePackageId} onValueChange={setSourcePackageId} disabled={!srcCategory}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Package..." /></SelectTrigger>
                    <SelectContent>
                      {packages.filter(p => p.provider_id === srcProvider && (p.category_id || '_none') === srcCategory).map(pkg => (
                        <SelectItem key={pkg.id} value={pkg.id}>{pkg.package_name} (${pkg.selling_price})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* === TARGETS === */}
            {targets.map((target, idx) => (
              <div key={target.id} className="space-y-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Target #{idx + 1}</Label>
                  {targets.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeTarget(idx)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Shirkad</Label>
                    <Select value={target.provider} onValueChange={(v) => updateTarget(idx, { provider: v, category: '', packageId: '' })}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Shirkad..." /></SelectTrigger>
                      <SelectContent>
                        {[...new Map(packages.map(p => [p.provider_id, p.provider_name])).entries()].map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select value={target.category} onValueChange={(v) => updateTarget(idx, { category: v, packageId: '' })} disabled={!target.provider}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Category..." /></SelectTrigger>
                      <SelectContent>
                        {[...new Map(packages.filter(p => p.provider_id === target.provider).map(p => [p.category_id || '_none', p.category_name || 'Kale'])).entries()].map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Package</Label>
                    <Select value={target.packageId} onValueChange={(v) => updateTarget(idx, { packageId: v })} disabled={!target.category}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Package..." /></SelectTrigger>
                      <SelectContent>
                        {packages.filter(p => p.provider_id === target.provider && (p.category_id || '_none') === target.category).map(pkg => (
                          <SelectItem key={pkg.id} value={pkg.id}>{pkg.package_name} (${pkg.selling_price})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Imisa mar</Label>
                    <Input type="number" min="1" value={target.deliveryCount} onChange={e => updateTarget(idx, { deliveryCount: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Sugitaan (daq)</Label>
                    <Input type="number" min="0" value={target.delayMinutes} onChange={e => updateTarget(idx, { delayMinutes: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Tartiiibka</Label>
                    <Input type="number" min="1" value={target.executionOrder} onChange={e => updateTarget(idx, { executionOrder: e.target.value })} className="mt-1" />
                  </div>
                </div>
              </div>
            ))}

            {!editingRule && (
              <Button type="button" variant="outline" className="w-full" onClick={addTarget}>
                <Plus className="h-4 w-4 mr-2" />
                Target kale ku dar
              </Button>
            )}

            <div>
              <Label>Qoraal (ikhtiyaari)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Tusaale: 2 maalin = 2x 24 saac" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>Ka noqo</Button>
            <Button onClick={handleSave}>Kaydi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
