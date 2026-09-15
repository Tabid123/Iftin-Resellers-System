import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, AlertTriangle, UserX, Package, HelpCircle, Trash2 } from 'lucide-react';
import { UnmatchedPaymentActions } from './UnmatchedPaymentActions';

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'all';

function getPeriodStart(period: PeriodFilter): Date | null {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case 'today':
      d.setHours(0, 0, 0, 0);
      return d;
    case 'week': {
      const day = d.getDay(); // 0 = Sunday
      const diff = day === 0 ? 6 : day - 1; // Monday start
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    case 'year':
      d.setMonth(0, 1);
      d.setHours(0, 0, 0, 0);
      return d;
    default:
      return null;
  }
}

function getUnmatchedReason(payment: any): { icon: React.ReactNode; title: string; detail: string } {
  const notes = (payment.admin_notes || '').toLowerCase();

  if (notes.includes('amount mismatch')) {
    const extractField = (field: string) => {
      const regex = new RegExp(`${field}:\\s*([^|]+)`, 'i');
      const match = (payment.admin_notes || '').match(regex);
      return match ? match[1].trim() : null;
    };
    const paid = extractField('Paid') || `$${payment.amount}`;
    const expected = extractField('Expected');
    const intendedPackage = extractField('Intended Package');
    const receiver = extractField('Receiver entered');
    const provider = extractField('Provider');

    const detailParts = [`Lacag la bixiyay: ${paid}`];
    if (expected) detailParts.push(`La filayay: ${expected}`);
    if (intendedPackage) detailParts.push(`Xirmo: ${intendedPackage}`);
    if (provider) detailParts.push(`Provider: ${provider}`);
    if (receiver) detailParts.push(`Receiver: ${receiver}`);

    return {
      icon: <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />,
      title: '⚠️ Lacagtu kama ekayn dalabka (Fraud Check)',
      detail: detailParts.join(' | '),
    };
  }

  if (notes.includes('no offline registration')) {
    return {
      icon: <UserX className="h-4 w-4 text-destructive mt-0.5 shrink-0" />,
      title: 'Lambarkaan system-ka kuma jiro',
      detail: `Lambarka ${payment.sender_phone} ma jiro system-ka. Macmiilku wuu u baahan yahay inuu marka hore isdiiwaangeliyo.`,
    };
  }

  if (notes.includes('no package found') || notes.includes('no package for')) {
    const crossMatch = notes.match(/waa xirmo (.+?) ah \((.+?)\)/);
    if (crossMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: 'Provider-ka qaldan ayuu ku isdiiwaangeliyay',
        detail: `$${payment.amount} - waa xirmo ${crossMatch[1]} ah (${crossMatch[2]}), laakiin macmiilku wuxuu isdiiwaangeliyay provider kale.`,
      };
    }
    const packageMatch = (payment.admin_notes || '').match(/No package for \$?([\d.]+) on (\w+)/i);
    if (packageMatch) {
      return {
        icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
        title: `Ma jiro xirmo $${packageMatch[1]} - ${packageMatch[2]}`,
        detail: `$${payment.amount} - ${packageMatch[2]} xirmo qiimahaan la iibiyo ma jiro. SIM: ${payment.receiver_sim || 'N/A'}`,
      };
    }
    return {
      icon: <Package className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />,
      title: 'Ma jiro xirmo qiimahaan la iibiyo',
      detail: `$${payment.amount} - ma jiro xirmo qiimahaan ah oo active ah.`,
    };
  }

  return {
    icon: <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />,
    title: 'Sabab la garaneyn',
    detail: payment.admin_notes || `Dalab la mid ah lama helin lambarka ${payment.sender_phone}`,
  };
}

const UnmatchedPayments = () => {
  const { toast } = useToast();
  const [unmatchedPayments, setUnmatchedPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchUnmatched = async () => {
      try {
        const { data, error } = await supabase
          .from('payment_receipts')
          .select('*')
          .eq('status', 'unmatched')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setUnmatchedPayments(data || []);
      } catch (error) {
        console.error('Error fetching unmatched payments:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUnmatched();

    const channel = supabase
      .channel('unmatched-payments-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const newRow = payload.new as any;
        if (newRow.status === 'unmatched') setUnmatchedPayments((prev) => [newRow, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const updated = payload.new as any;
        if (updated.status === 'unmatched') {
          setUnmatchedPayments((prev) => {
            const exists = prev.find((p) => p.id === updated.id);
            if (exists) return prev.map((p) => (p.id === updated.id ? updated : p));
            return [updated, ...prev];
          });
        } else {
          setUnmatchedPayments((prev) => prev.filter((p) => p.id !== updated.id));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'payment_receipts' }, (payload) => {
        const old = payload.old as any;
        setUnmatchedPayments((prev) => prev.filter((p) => p.id !== old.id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredPayments = useMemo(() => {
    const start = getPeriodStart(period);
    if (!start) return unmatchedPayments;
    return unmatchedPayments.filter((p) => new Date(p.created_at) >= start);
  }, [unmatchedPayments, period]);

  const allSelected = filteredPayments.length > 0 && filteredPayments.every((p) => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPayments.map((p) => p.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('payment_receipts').delete().in('id', ids);
      if (error) throw error;
      setUnmatchedPayments((prev) => prev.filter((p) => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      toast({ title: 'La tirtiray', description: `${ids.length} qoraal ayaa la tirtiray.` });
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base">⚠️ Unmatched ({filteredPayments.length})</CardTitle>
          {someSelected && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="h-8 text-xs gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  Tirtir ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hubi tirtiridda</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ma hubtaa inaad rabto inaad tirtirto {selectedIds.size} qoraal? Tani waa wax aan dib loo soo celin karin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Jooji</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteSelected} disabled={isDeleting}>
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Haa, tirtir'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <TabsList className="grid grid-cols-5 w-full h-9">
            <TabsTrigger value="today" className="text-xs">Maanta</TabsTrigger>
            <TabsTrigger value="week" className="text-xs">Isbuucan</TabsTrigger>
            <TabsTrigger value="month" className="text-xs">Bishaan</TabsTrigger>
            <TabsTrigger value="year" className="text-xs">Sanadkan</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">Dhammaan</TabsTrigger>
          </TabsList>
        </Tabs>

        {filteredPayments.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} id="select-all-unmatched" />
            <label htmlFor="select-all-unmatched" className="text-xs text-muted-foreground cursor-pointer">
              Dooro dhammaan ({filteredPayments.length})
            </label>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {filteredPayments.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-2">
              {filteredPayments.map((payment) => {
                const reason = getUnmatchedReason(payment);
                const isSelected = selectedIds.has(payment.id);
                return (
                  <div
                    key={payment.id}
                    className={`border rounded-lg p-3 bg-card text-xs space-y-2 ${isSelected ? 'border-primary ring-1 ring-primary' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(payment.id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="font-mono font-medium">{payment.sender_phone}</span>
                          <span className="font-semibold">${payment.amount}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{payment.receiver_sim}</Badge>
                          <span className="text-muted-foreground text-[10px]">{new Date(payment.created_at).toLocaleString()}</span>
                        </div>
                        <div className="flex items-start gap-2 bg-muted/50 rounded p-2">
                          {reason.icon}
                          <div>
                            <p className="font-medium text-xs">{reason.title}</p>
                            <p className="text-[10px] text-muted-foreground">{reason.detail}</p>
                          </div>
                        </div>
                        <UnmatchedPaymentActions
                          payment={payment}
                          onChanged={() => setUnmatchedPayments((prev) => prev.filter((p) => p.id !== payment.id))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead>Sender Phone</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>SIM</TableHead>
                    <TableHead>Sababta (Reason)</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Ficil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayments.map((payment) => {
                    const reason = getUnmatchedReason(payment);
                    const isSelected = selectedIds.has(payment.id);
                    return (
                      <TableRow key={payment.id} data-state={isSelected ? 'selected' : undefined}>
                        <TableCell>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleOne(payment.id)} />
                        </TableCell>
                        <TableCell className="font-mono">{payment.sender_phone}</TableCell>
                        <TableCell className="font-semibold">${payment.amount}</TableCell>
                        <TableCell><Badge variant="outline">{payment.receiver_sim}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-start gap-2 max-w-xs">
                            {reason.icon}
                            <div>
                              <p className="text-sm font-medium">{reason.title}</p>
                              <p className="text-xs text-muted-foreground">{reason.detail}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(payment.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <UnmatchedPaymentActions
                            payment={payment}
                            onChanged={() => setUnmatchedPayments((prev) => prev.filter((p) => p.id !== payment.id))}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>✅ Ma jiro lacag aan match noqon muddadan</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UnmatchedPayments;
