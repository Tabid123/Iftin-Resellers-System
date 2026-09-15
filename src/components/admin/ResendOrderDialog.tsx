import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  fetchIftinCatalog,
  mapCategories,
  mapPackages,
  mapProviders,
  type IftinCatalog,
} from '@/lib/iftinCatalog';
import { createIftinIntent } from '@/lib/iftinIntent';
import type { PartnerPayment } from '@/lib/iftinPayments.functions';

type Props = {
  payment: PartnerPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (payment: PartnerPayment) => Promise<void> | void;
};

const ResendOrderDialog: React.FC<Props> = ({ payment, open, onOpenChange, onResolve }) => {
  const [catalog, setCatalog] = useState<IftinCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!open) return;
    setPhone((payment?.receiver_phone ?? '').replace(/\D/g, ''));
    setLoading(true);
    void fetchIftinCatalog()
      .then((c) => setCatalog(c))
      .finally(() => setLoading(false));
  }, [open, payment?.receiver_phone]);

  const providers = useMemo(() => (catalog ? mapProviders(catalog) : []), [catalog]);
  const categories = useMemo(
    () => (catalog && providerId ? mapCategories(catalog, providerId) : []),
    [catalog, providerId],
  );
  const packages = useMemo(() => {
    if (!catalog || !providerId) return [];
    const all = mapPackages(catalog, providerId);
    return categoryId ? all.filter((p) => p.category_id === categoryId) : all;
  }, [catalog, providerId, categoryId]);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const canSend = Boolean(providerId && packageId && phone.length >= 9 && !sending);

  const handleSend = async () => {
    if (!payment || !selectedPackage) return;
    setSending(true);
    try {
      await createIftinIntent({
        receiver_phone: phone,
        sender_phone: (payment.sender_phone ?? '').replace(/\D/g, ''),
        package_id: selectedPackage.id,
        payment_provider: payment.provider ?? '',
        package_name: selectedPackage.package_name,
        data_amount: selectedPackage.data_amount ?? null,
        provider_id: providerId,
        customer_phone: phone,
      });
      await onResolve(payment);
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Lama dirin',
        description: e?.message ?? 'Isku day mar kale',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dib u dir dalabka</DialogTitle>
          <DialogDescription>
            Dooro shirkada, qeybta, xirmada iyo lambarka helaya, kadibna dir.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
              Lacagta: ${Number(payment?.amount ?? 0).toFixed(2)} · Diray:{' '}
              {payment?.sender_phone ?? '—'}
            </div>

            <div className="space-y-1.5">
              <Label>Shirkadda</Label>
              <Select
                value={providerId}
                onValueChange={(v) => {
                  setProviderId(v);
                  setCategoryId('');
                  setPackageId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Dooro shirkad" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.provider_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Qeybta</Label>
              <Select
                value={categoryId}
                onValueChange={(v) => {
                  setCategoryId(v);
                  setPackageId('');
                }}
                disabled={!providerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Dooro qeyb" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Xirmada</Label>
              <Select value={packageId} onValueChange={setPackageId} disabled={!providerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Dooro xirmo" />
                </SelectTrigger>
                <SelectContent>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.package_name} — ${Number(p.selling_price ?? 0).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Lambarka helaya</Label>
              <Input
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="61xxxxxxx"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Jooji
          </Button>
          <Button onClick={() => void handleSend()} disabled={!canSend}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            <span className="ml-1">Dib u dir</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResendOrderDialog;
