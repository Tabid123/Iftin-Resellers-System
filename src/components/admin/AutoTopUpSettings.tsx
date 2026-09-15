import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Trash2, Power, Zap, ShoppingCart, Package, ChevronDown } from 'lucide-react';
import { AutoTopUpDeliveryRules } from './AutoTopUpDeliveryRules';
import { validateUssdTemplate } from '@/lib/ussdValidator';
import { useLanguage } from '@/contexts/LanguageContext';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';

interface AutoTopUpNumber {
  id: string;
  phone_number: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}

interface AutoTopUpPackage {
  id: string;
  topup_number_id: string;
  package_name: string;
  selling_price: number;
  data_amount: string;
  ussd_code: string | null;
  provider_name: string;
  is_active: boolean;
  created_at: string;
}

interface AutoTopUpOrder {
  id: string;
  customer_phone: string;
  sender_phone: string | null;
  receiver_phone: string;
  package_name: string;
  data_amount: string | null;
  selling_price: number;
  delivery_status: string | null;
  created_at: string;
  payment_number: string | null;
}

const PROVIDERS = ['hormuud', 'somnet', 'somtel', 'amtel', 'somlink'];

export const AutoTopUpSettings = () => {
  const { language } = useLanguage();
  const [numbers, setNumbers] = useState<AutoTopUpNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhone, setNewPhone] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  // Packages per number
  const [packages, setPackages] = useState<Record<string, AutoTopUpPackage[]>>({});
  const [pkgForms, setPkgForms] = useState<Record<string, { name: string; price: string; data: string; provider: string; ussd: string; simPassword: string }>>({});
  const [addingPkg, setAddingPkg] = useState<string | null>(null);

  // Orders section
  const [orders, setOrders] = useState<AutoTopUpOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedNumber, setSelectedNumber] = useState('all');

  useEffect(() => { loadNumbers(); }, []);
  useEffect(() => { loadOrders(); }, [dateFilter, selectedNumber]);

  const loadNumbers = async () => {
    const { data, error } = await supabase
      .from('auto_topup_numbers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNumbers(data || []);
      // Load packages for all numbers
      if (data && data.length > 0) {
        const ids = data.map(n => n.id);
        const { data: pkgData } = await supabase
          .from('auto_topup_packages')
          .select('*')
          .in('topup_number_id', ids)
          .order('created_at', { ascending: false });
        
        const grouped: Record<string, AutoTopUpPackage[]> = {};
        (pkgData || []).forEach((p: AutoTopUpPackage) => {
          if (!grouped[p.topup_number_id]) grouped[p.topup_number_id] = [];
          grouped[p.topup_number_id].push(p);
        });
        setPackages(grouped);
      }
    }
    setLoading(false);
  };

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const now = new Date();
      let dateFrom: Date | null = null;
      let dateTo: Date | null = null;

      switch (dateFilter) {
        case 'today': dateFrom = startOfDay(now); dateTo = endOfDay(now); break;
        case 'yesterday': dateFrom = startOfDay(subDays(now, 1)); dateTo = endOfDay(subDays(now, 1)); break;
        case '7days': dateFrom = startOfDay(subDays(now, 7)); dateTo = endOfDay(now); break;
        case '30days': dateFrom = startOfDay(subDays(now, 30)); dateTo = endOfDay(now); break;
      }

      let query = supabase
        .from('orders')
        .select('id, customer_phone, sender_phone, receiver_phone, package_name, data_amount, selling_price, delivery_status, created_at, payment_number')
        .eq('payment_source', 'auto_topup')
        .order('created_at', { ascending: false })
        .limit(100);

      if (dateFrom) query = query.gte('created_at', dateFrom.toISOString());
      if (dateTo) query = query.lte('created_at', dateTo.toISOString());
      if (selectedNumber !== 'all') query = query.eq('payment_number', selectedNumber);

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      console.error('Error loading auto-topup orders:', err);
    }
    setOrdersLoading(false);
  };

  const addNumber = async () => {
    if (!newPhone.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('auto_topup_numbers').insert({
      phone_number: newPhone.trim(),
      label: newLabel.trim() || null,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Lambarka waa lagu daray' : 'Number added' });
      setNewPhone('');
      setNewLabel('');
      loadNumbers();
    }
    setAdding(false);
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase.from('auto_topup_numbers').update({ is_active: !currentActive }).eq('id', id);
    if (!error) loadNumbers();
  };

  const deleteNumber = async (id: string) => {
    const { error } = await supabase.from('auto_topup_numbers').delete().eq('id', id);
    if (!error) loadNumbers();
  };

  // Package management
  const getPkgForm = (numberId: string) => pkgForms[numberId] || { name: '', price: '', data: '', provider: 'hormuud', ussd: '', simPassword: '' };
  
  const updatePkgForm = (numberId: string, field: string, value: string) => {
    setPkgForms(prev => ({
      ...prev,
      [numberId]: { ...getPkgForm(numberId), [field]: value }
    }));
  };

  const addPackage = async (numberId: string) => {
    const form = getPkgForm(numberId);
    if (!form.name.trim() || !form.price.trim()) return;

    const ussdCheck = validateUssdTemplate(form.ussd);
    if (!ussdCheck.valid) {
      toast({ title: language === 'so' ? 'USSD qaldan' : 'Invalid USSD', description: ussdCheck.error, variant: 'destructive' });
      return;
    }
    setAddingPkg(numberId);

    const { error } = await supabase.from('auto_topup_packages').insert({
      topup_number_id: numberId,
      package_name: form.name.trim(),
      selling_price: parseFloat(form.price),
      data_amount: form.data.trim(),
      ussd_code: form.ussd.trim() || null,
      provider_name: form.provider,
      sim_password: form.simPassword.trim() || null,
    } as any);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Package waa lagu daray' : 'Package added' });
      setPkgForms(prev => ({ ...prev, [numberId]: { name: '', price: '', data: '', provider: 'hormuud', ussd: '', simPassword: '' } }));
      loadNumbers();
    }
    setAddingPkg(null);
  };

  const togglePackage = async (pkgId: string, currentActive: boolean) => {
    await supabase.from('auto_topup_packages').update({ is_active: !currentActive }).eq('id', pkgId);
    loadNumbers();
  };

  const deletePackage = async (pkgId: string) => {
    await supabase.from('auto_topup_packages').delete().eq('id', pkgId);
    loadNumbers();
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Numbers Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            {language === 'so' ? 'Auto Top-Up Lambarada' : 'Auto Top-Up Numbers'}
          </CardTitle>
          <CardDescription>
            {language === 'so'
              ? 'Lambar kasta waxaad ku dari kartaa package-yada gaarka ah. Marka lacag timaado, KALIYA package-yada halkan la geliyay ayaa la eegayaa.'
              : 'Each number has its own custom packages. When payment arrives, ONLY packages added here are matched.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add number form */}
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label>{language === 'so' ? 'Lambarka' : 'Phone Number'}</Label>
              <Input type="tel" inputMode="numeric" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="617195659" />
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label>{language === 'so' ? 'Sharax' : 'Label'}</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Auto Reload Line" />
            </div>
            <Button onClick={addNumber} disabled={adding || !newPhone.trim()}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {language === 'so' ? 'Ku dar' : 'Add'}
            </Button>
          </div>

          {/* Numbers with expandable packages */}
          {numbers.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              {language === 'so' ? 'Wali lambar ma jiro' : 'No auto top-up numbers yet'}
            </p>
          ) : (
            <Accordion type="multiple" className="space-y-2">
              {numbers.map((num) => {
                const numPkgs = packages[num.id] || [];
                const form = getPkgForm(num.id);
                return (
                  <AccordionItem key={num.id} value={num.id} className="border rounded-lg px-3">
                    <div className="flex items-center justify-between py-2">
                      <AccordionTrigger className="flex-1 hover:no-underline py-1">
                        <div className="flex items-center gap-2 text-left">
                          <span className="font-mono font-semibold">{num.phone_number}</span>
                          {num.label && <span className="text-muted-foreground text-sm">({num.label})</span>}
                          <Badge variant={num.is_active ? 'default' : 'secondary'} className="text-xs">
                            {num.is_active ? (language === 'so' ? 'ON' : 'Active') : 'Off'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {numPkgs.length} pkg
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <div className="flex gap-1 ml-2">
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); toggleActive(num.id, num.is_active); }}>
                          <Power className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); deleteNumber(num.id); }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <AccordionContent className="pb-4">
                      {/* Package list */}
                      {numPkgs.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {numPkgs.map(pkg => (
                            <div key={pkg.id} className="flex items-center justify-between bg-muted/50 rounded-md p-2 text-sm">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{pkg.package_name}</div>
                                <div className="text-muted-foreground text-xs">
                                  ${pkg.selling_price} · {pkg.data_amount || '-'} · {pkg.provider_name}
                                </div>
                              </div>
                              <div className="flex gap-1 ml-2 shrink-0">
                                <Badge variant={pkg.is_active ? 'default' : 'secondary'} className="text-xs cursor-pointer" onClick={() => togglePackage(pkg.id, pkg.is_active)}>
                                  {pkg.is_active ? 'ON' : 'OFF'}
                                </Badge>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deletePackage(pkg.id)}>
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add package form */}
                      <div className="border-t pt-3 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          {language === 'so' ? 'Package cusub ku dar' : 'Add new package'}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">{language === 'so' ? 'Magaca' : 'Name'}</Label>
                            <Input value={form.name} onChange={(e) => updatePkgForm(num.id, 'name', e.target.value)} placeholder="1GB 30 Days" className="h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">{language === 'so' ? 'Qiimaha ($)' : 'Price ($)'}</Label>
                            <Input type="number" value={form.price} onChange={(e) => updatePkgForm(num.id, 'price', e.target.value)} placeholder="1.00" className="h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Data</Label>
                            <Input value={form.data} onChange={(e) => updatePkgForm(num.id, 'data', e.target.value)} placeholder="1GB" className="h-8 text-sm" />
                          </div>
                          <div>
                            <Label className="text-xs">Provider</Label>
                            <Select value={form.provider} onValueChange={(v) => updatePkgForm(num.id, 'provider', v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PROVIDERS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">SIM Password</Label>
                            <Input type="tel" inputMode="numeric" pattern="[0-9]*" value={form.simPassword} onChange={(e) => updatePkgForm(num.id, 'simPassword', e.target.value.replace(/\D/g, ''))} placeholder="5516" className="h-8 text-sm" />
                          </div>
                        </div>
                        <Button size="sm" onClick={() => addPackage(num.id)} disabled={addingPkg === num.id || !form.name.trim() || !form.price.trim()} className="w-full">
                          {addingPkg === num.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                          {language === 'so' ? 'Ku dar Package' : 'Add Package'}
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Delivery Rules */}
      <AutoTopUpDeliveryRules />

      {/* Auto Top-Up Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {language === 'so' ? 'Dalabyada Auto Top-Up' : 'Auto Top-Up Orders'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{language === 'so' ? 'Maanta' : 'Today'}</SelectItem>
                <SelectItem value="yesterday">{language === 'so' ? 'Shalay' : 'Yesterday'}</SelectItem>
                <SelectItem value="7days">{language === 'so' ? '7 Maalmood' : '7 Days'}</SelectItem>
                <SelectItem value="30days">{language === 'so' ? '30 Maalmood' : '30 Days'}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedNumber} onValueChange={setSelectedNumber}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder={language === 'so' ? 'Lambar' : 'Number'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === 'so' ? 'Dhammaan' : 'All Numbers'}</SelectItem>
                {numbers.map(n => (
                  <SelectItem key={n.id} value={n.phone_number}>
                    {n.phone_number} {n.label ? `(${n.label})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="self-center">
              {orders.length} {language === 'so' ? 'dalabood' : 'orders'}
            </Badge>
          </div>

          {ordersLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : orders.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {language === 'so' ? 'Dalab auto top-up ah ma jiro' : 'No auto top-up orders found'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === 'so' ? 'Waqti' : 'Time'}</TableHead>
                    <TableHead>{language === 'so' ? 'Soo Diray' : 'Sender'}</TableHead>
                    <TableHead>{language === 'so' ? 'Xirmo' : 'Package'}</TableHead>
                    <TableHead>{language === 'so' ? 'Lacag' : 'Amount'}</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(order.created_at), 'HH:mm dd/MM')}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{order.sender_phone || '-'}</TableCell>
                      <TableCell className="text-sm">{order.package_name}</TableCell>
                      <TableCell className="font-semibold">${order.selling_price.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={order.delivery_status === 'delivered' ? 'default' : order.delivery_status === 'failed' ? 'destructive' : 'secondary'}>
                          {order.delivery_status || 'pending'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
