import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Package, Send, FileText } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// --- Helper Functions ---

/** Strip 252, 0, + prefix → 9-digit local number */
function normalizePhoneForUssd(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('252')) p = p.slice(3);
  if (p.startsWith('0')) p = p.slice(1);
  return p;
}

/** Format amount for USSD: integer→"1", decimal<1→"009", decimal≥1→"0*99" */
function formatAmountForUssd(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  const str = amount.toFixed(2);
  if (amount < 1) return str.replace('.', '').replace(/^0+/, '0');
  return str.replace('.', '*');
}

/** "Hormuud EVC Plus" → "hormuud" */
function normalizeProviderSlug(name: string): string {
  return name.toLowerCase().split(/\s+/)[0];
}

/** Format phone for storage: ensure 252 prefix */
function formatPhoneForStorage(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (!p.startsWith('252')) p = '252' + p;
  return p;
}

// --- Types ---

interface Provider {
  id: string;
  provider_name: string;
}

interface DataPackage {
  id: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  cost_price: number;
  ussd_code: string | null;
  category_id: string | null;
}

interface DeliveryRule {
  id: string;
  target_package_id: string;
  delivery_count: number;
  delay_minutes: number;
  execution_order: number;
  target_package?: DataPackage;
}

interface DeliveryInstruction {
  id: string;
  code_template: string | null;
  sim_password: string | null;
  provider_id: string | null;
  category_id: string | null;
  package_id: string | null;
}

interface AddManualDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceName: string;
  simSlot: 1 | 2;
  providerName: string;
  onSuccess: () => void;
}

export const AddManualDeliveryDialog: React.FC<AddManualDeliveryDialogProps> = ({
  open,
  onOpenChange,
  deviceId,
  deviceName,
  simSlot,
  providerName,
  onSuccess,
}) => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [packages, setPackages] = useState<DataPackage[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [bundleRules, setBundleRules] = useState<DeliveryRule[]>([]);

  // Mode: true = auto-deliver, false = record only
  const [autoDeliver, setAutoDeliver] = useState(true);

  // Form state
  const [selectedProviderId, setSelectedProviderId] = useState<string>('');
  const [selectedPackageId, setSelectedPackageId] = useState<string>('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [deliveryDate, setDeliveryDate] = useState<Date>(new Date());
  const [notes, setNotes] = useState('');

  // Load providers on mount
  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');

      if (data) {
        setProviders(data);
        const matchingProvider = data.find(
          p => p.provider_name.toLowerCase() === providerName.toLowerCase()
        );
        if (matchingProvider) {
          setSelectedProviderId(matchingProvider.id);
        }
      }
    };

    if (open) {
      loadProviders();
    }
  }, [open, providerName]);

  // Load packages when provider changes
  useEffect(() => {
    const loadPackages = async () => {
      if (!selectedProviderId) {
        setPackages([]);
        return;
      }
      setLoadingPackages(true);
      const { data } = await supabase
        .from('data_packages_config')
        .select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id')
        .eq('provider_id', selectedProviderId)
        .eq('is_active', true)
        .order('selling_price');

      if (data) setPackages(data);
      setLoadingPackages(false);
    };
    loadPackages();
  }, [selectedProviderId]);

  // Check bundle rules when package changes
  useEffect(() => {
    const checkBundleRules = async () => {
      if (!selectedPackageId) {
        setBundleRules([]);
        return;
      }
      const { data: rules } = await supabase
        .from('package_delivery_rules')
        .select('*')
        .eq('source_package_id', selectedPackageId)
        .eq('is_active', true)
        .order('execution_order');

      if (rules && rules.length > 0) {
        const enrichedRules = await Promise.all(
          rules.map(async (rule) => {
            const { data: targetPkg } = await supabase
              .from('data_packages_config')
              .select('id, package_name, data_amount, selling_price, cost_price, ussd_code, category_id')
              .eq('id', rule.target_package_id)
              .single();
            return { ...rule, target_package: targetPkg || undefined };
          })
        );
        setBundleRules(enrichedRules as DeliveryRule[]);
      } else {
        setBundleRules([]);
      }
    };
    checkBundleRules();
  }, [selectedPackageId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedPackageId('');
      setReceiverPhone('');
      setSenderPhone('');
      setDeliveryDate(new Date());
      setNotes('');
      setBundleRules([]);
      setAutoDeliver(true);
    }
  }, [open]);

  /**
   * Cascading USSD template lookup:
   * 1. Package-specific
   * 2. Category-level
   * 3. Provider default
   */
  const lookupUssdTemplate = useCallback(async (
    providerId: string,
    pkg: DataPackage,
    receiverRaw: string,
  ): Promise<string | null> => {
    // 1. Package-specific
    const { data: pkgLevel } = await supabase
      .from('delivery_instructions')
      .select('code_template, sim_password')
      .eq('provider_id', providerId)
      .eq('package_id', pkg.id)
      .limit(1)
      .maybeSingle();

    let template = pkgLevel?.code_template;
    let simPassword = pkgLevel?.sim_password || '';

    // 2. Category-level
    if (!template && pkg.category_id) {
      const { data: catLevel } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', providerId)
        .eq('category_id', pkg.category_id)
        .is('package_id', null)
        .limit(1)
        .maybeSingle();
      template = catLevel?.code_template;
      simPassword = catLevel?.sim_password || simPassword;
    }

    // 3. Provider default
    if (!template) {
      const { data: provLevel } = await supabase
        .from('delivery_instructions')
        .select('code_template, sim_password')
        .eq('provider_id', providerId)
        .is('category_id', null)
        .is('package_id', null)
        .limit(1)
        .maybeSingle();
      template = provLevel?.code_template;
      simPassword = provLevel?.sim_password || simPassword;
    }

    // 4. Fallback to package ussd_code
    if (!template && pkg.ussd_code) {
      return pkg.ussd_code;
    }

    if (!template) return null;

    // Replace placeholders
    const normalizedPhone = normalizePhoneForUssd(receiverRaw);
    const formattedAmount = formatAmountForUssd(pkg.cost_price);
    const packageCode = pkg.ussd_code || '';

    return template
      .replace(/\{receiver_phone\}/g, normalizedPhone)
      .replace(/\{package_code\}/g, packageCode)
      .replace(/\{cost_price\}/g, formattedAmount)
      .replace(/\{sim_password\}/g, simPassword);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProviderId || !selectedPackageId || !receiverPhone || receiverPhone.length < 9) {
      toast({
        title: language === 'so' ? 'Fadlan buuxi dhammaan meelaha' : 'Please fill all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (!autoDeliver && deliveryDate > new Date()) {
      toast({
        title: language === 'so' ? 'Taariikhdu ma noqon kartid mustaqbalka' : 'Date cannot be in the future',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const selectedPackage = packages.find(p => p.id === selectedPackageId);
      const selectedProvider = providers.find(p => p.id === selectedProviderId);
      if (!selectedPackage || !selectedProvider) throw new Error('Package or provider not found');

      // For manual deliveries, use any payment provider (active or not)
      const { data: paymentProvider } = await supabase
        .from('payment_providers_config')
        .select('id')
        .order('is_active', { ascending: false })
        .limit(1)
        .maybeSingle();
      const paymentProviderId = paymentProvider?.id || null;

      const formattedReceiverPhone = formatPhoneForStorage(receiverPhone);
      const formattedSenderPhone = senderPhone ? formatPhoneForStorage(senderPhone) : null;

      if (autoDeliver) {
        await handleAutoDeliver(selectedPackage, selectedProvider, paymentProviderId, formattedReceiverPhone, formattedSenderPhone);
      } else {
        await handleRecordOnly(selectedPackage, selectedProvider, paymentProviderId, formattedReceiverPhone, formattedSenderPhone);
      }

      toast({
        title: language === 'so' ? 'Dalabka waa la keydiyay' : 'Delivery saved successfully',
        description: `${selectedPackage.package_name} - ${formattedReceiverPhone}${bundleRules.length > 0 ? ` (${bundleRules.reduce((sum, r) => sum + r.delivery_count, 0)} bundled)` : ''}`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error adding manual delivery:', error);
      toast({
        title: language === 'so' ? 'Khalad ayaa dhacay' : 'Error occurred',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /** Auto-deliver: create order as pending, build USSD, queue for Android */
  const handleAutoDeliver = async (
    pkg: DataPackage,
    provider: Provider,
    paymentProviderId: string | null,
    receiverFormatted: string,
    senderFormatted: string | null,
  ) => {
    // Determine packages to deliver (bundle or single)
    const packagesToDeliver: { pkg: DataPackage; count: number; delayMinutes: number }[] = [];

    if (bundleRules.length > 0) {
      for (const rule of bundleRules) {
        if (rule.target_package) {
          packagesToDeliver.push({
            pkg: rule.target_package,
            count: rule.delivery_count,
            delayMinutes: rule.delay_minutes,
          });
        }
      }
    } else {
      packagesToDeliver.push({ pkg, count: 1, delayMinutes: 0 });
    }

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        provider_id: selectedProviderId,
        package_id: selectedPackageId,
        package_name: pkg.package_name,
        data_amount: pkg.data_amount,
        selling_price: pkg.selling_price,
        receiver_phone: receiverFormatted,
        sender_phone: senderFormatted,
        customer_phone: senderFormatted || receiverFormatted,
        payment_number: 'MANUAL',
        payment_provider_id: paymentProviderId,
        status: 'completed',
        delivery_status: 'pending',
        payment_source: 'manual',
        is_manual: true,
        delivery_notes: notes || null,
      })
      .select('id')
      .single();
    if (orderError) throw orderError;

    // Build delivery_queue entries with USSD codes
    const queueEntries: any[] = [];
    const now = new Date();

    for (const item of packagesToDeliver) {
      const ussdCode = await lookupUssdTemplate(selectedProviderId, item.pkg, receiverPhone);
      if (!ussdCode) {
        throw new Error(`USSD code not found for ${item.pkg.package_name}. Add delivery_instructions first.`);
      }

      for (let i = 0; i < item.count; i++) {
        const scheduledAt = item.delayMinutes > 0
          ? new Date(now.getTime() + item.delayMinutes * 60 * 1000).toISOString()
          : null;

        queueEntries.push({
          order_id: order.id,
          receiver_phone: receiverFormatted,
          provider_name: normalizeProviderSlug(provider.provider_name),
          ussd_code: ussdCode,
          android_device_id: deviceId,
          sim_slot: simSlot === 1 ? 0 : 1,
          status: 'pending',
          scheduled_at: scheduledAt,
        });
      }
    }

    const { error: queueError } = await supabase.from('delivery_queue').insert(queueEntries);
    if (queueError) throw queueError;
  };

  /** Record Only: mark as already delivered */
  const handleRecordOnly = async (
    pkg: DataPackage,
    provider: Provider,
    paymentProviderId: string | null,
    receiverFormatted: string,
    senderFormatted: string | null,
  ) => {
    const selectedDateISO = deliveryDate.toISOString();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        provider_id: selectedProviderId,
        package_id: selectedPackageId,
        package_name: pkg.package_name,
        data_amount: pkg.data_amount,
        selling_price: pkg.selling_price,
        receiver_phone: receiverFormatted,
        sender_phone: senderFormatted,
        customer_phone: senderFormatted || receiverFormatted,
        payment_number: 'MANUAL',
        payment_provider_id: paymentProviderId,
        status: 'completed',
        delivery_status: 'delivered',
        delivered_at: selectedDateISO,
        created_at: selectedDateISO,
        updated_at: selectedDateISO,
        payment_source: 'manual',
        is_manual: true,
        delivery_notes: notes || null,
      })
      .select('id')
      .single();
    if (orderError) throw orderError;

    // Bundle or single delivery_queue entries (record only)
    if (bundleRules.length > 0) {
      const queueEntries = bundleRules.flatMap(rule =>
        Array.from({ length: rule.delivery_count }, () => ({
          order_id: order.id,
          receiver_phone: receiverFormatted,
          provider_name: normalizeProviderSlug(provider.provider_name),
          ussd_code: 'MANUAL',
          android_device_id: deviceId,
          sim_slot: simSlot === 1 ? 0 : 1,
          status: 'completed',
          completed_at: selectedDateISO,
          created_at: selectedDateISO,
        }))
      );
      await supabase.from('delivery_queue').insert(queueEntries);
    } else {
      await supabase.from('delivery_queue').insert({
        order_id: order.id,
        receiver_phone: receiverFormatted,
        provider_name: normalizeProviderSlug(provider.provider_name),
        ussd_code: 'MANUAL',
        android_device_id: deviceId,
        sim_slot: simSlot === 1 ? 0 : 1,
        status: 'completed',
        completed_at: selectedDateISO,
        created_at: selectedDateISO,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {language === 'so' ? 'Ku Dar Dalab Manual' : 'Add Manual Delivery'}
          </DialogTitle>
          <DialogDescription>
            {`${deviceName} - SIM ${simSlot} (${providerName})`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode Toggle */}
          <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2">
              {autoDeliver ? (
                <Send className="h-4 w-4 text-primary" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {autoDeliver
                    ? (language === 'so' ? 'Otomaatig u dir' : 'Auto-deliver')
                    : (language === 'so' ? 'Diiwaangeli kaliya' : 'Record Only')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {autoDeliver
                    ? (language === 'so' ? 'USSD si otomaatig ah loo diraa' : 'USSD sent automatically via Android')
                    : (language === 'so' ? 'Horey loo diray, keydiye kaliya' : 'Already delivered, just recording')}
                </p>
              </div>
            </div>
            <Switch checked={autoDeliver} onCheckedChange={setAutoDeliver} />
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger>
                <SelectValue placeholder={language === 'so' ? 'Dooro provider' : 'Select provider'} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.provider_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Package Selection */}
          <div className="space-y-2">
            <Label>Package</Label>
            <Select
              value={selectedPackageId}
              onValueChange={setSelectedPackageId}
              disabled={!selectedProviderId || loadingPackages}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  loadingPackages
                    ? (language === 'so' ? 'Waa la soo qaadayaa...' : 'Loading...')
                    : (language === 'so' ? 'Dooro package' : 'Select package')
                } />
              </SelectTrigger>
              <SelectContent>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>
                    {pkg.package_name} - {pkg.data_amount} (${pkg.selling_price})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bundle Info */}
          {bundleRules.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Package className="h-4 w-4 text-blue-500" />
                {language === 'so' ? 'Xirmad isku xiran' : 'Bundled Package'}
              </div>
              <p className="text-xs text-muted-foreground">
                {language === 'so'
                  ? `${bundleRules.reduce((sum, r) => sum + r.delivery_count, 0)} delivery ayaa la sameyn doonaa`
                  : `${bundleRules.reduce((sum, r) => sum + r.delivery_count, 0)} deliveries will be created`}
              </p>
              <div className="mt-2 space-y-1">
                {bundleRules.map((rule) => (
                  <div key={rule.id} className="text-xs flex justify-between">
                    <span>{rule.target_package?.package_name || 'Unknown'} x{rule.delivery_count}</span>
                    {rule.delay_minutes > 0 && <Badge variant="outline" className="text-[10px]">{rule.delay_minutes}m delay</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Receiver Phone */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Qaataha' : 'Receiver Phone'}</Label>
            <Input type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="61XXXXXXX" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} maxLength={9} />
          </div>

          {/* Sender Phone (Optional) */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Numberka Macmiilka (ikhtiyaari)' : 'Customer Phone (optional)'}</Label>
            <Input type="tel" inputMode="numeric" pattern="[0-9]*" placeholder="61XXXXXXX" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} maxLength={9} />
          </div>

          {/* Delivery Date — Record Only mode only */}
          {!autoDeliver && (
            <div className="space-y-2">
              <Label>{language === 'so' ? 'Taariikhda Delivery' : 'Delivery Date'}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !deliveryDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deliveryDate ? format(deliveryDate, 'PPP') : (language === 'so' ? 'Dooro taariikh' : 'Pick a date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={deliveryDate}
                    onSelect={(date) => date && setDeliveryDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>{language === 'so' ? 'Faahfaahin (ikhtiyaari)' : 'Notes (optional)'}</Label>
            <Textarea placeholder={language === 'so' ? 'Faahfaahin dheeraad ah...' : 'Additional notes...'} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Submit Button */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{language === 'so' ? 'Waa la keydiyaa...' : 'Saving...'}</>
              ) : autoDeliver ? (
                <><Send className="mr-2 h-4 w-4" />{language === 'so' ? 'U Dir' : 'Send'}</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />{language === 'so' ? 'Ku Dar' : 'Add'}</>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
