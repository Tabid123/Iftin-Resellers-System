import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, ShieldAlert, CheckCircle, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface FraudAlert {
  id: string;
  sender_phone: string;
  amount: number;
  alert_type: string;
  severity: string;
  description: string | null;
  is_reviewed: boolean;
  notes: string | null;
  created_at: string;
}

export function FraudAlerts() {
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['fraud-alerts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fraud_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as FraudAlert[];
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('fraud_alerts')
        .update({
          is_reviewed: true,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          notes,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fraud-alerts'] });
      setSelectedAlert(null);
      setReviewNotes('');
      toast({ title: language === 'so' ? 'Guul' : 'Success', description: language === 'so' ? 'Alert waa la hubiyay' : 'Alert reviewed' });
    },
  });

  const unreviewed = alerts?.filter(a => !a.is_reviewed).length || 0;

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'high': return <Badge className="bg-red-500/20 text-red-700">🔴 High</Badge>;
      case 'medium': return <Badge className="bg-amber-500/20 text-amber-700">🟡 Medium</Badge>;
      default: return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const alertTypeBadge = (type: string) => {
    switch (type) {
      case 'high_amount': return <Badge variant="outline">💰 Lacag badan</Badge>;
      case 'high_frequency': return <Badge variant="outline">⚡ Inta badan</Badge>;
      case 'duplicate_payment': return <Badge variant="outline">📋 Duplicate</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-red-500" />
                {language === 'so' ? 'Fraud Alerts' : 'Fraud Alerts'}
                {unreviewed > 0 && (
                  <Badge className="bg-red-500 text-white">{unreviewed}</Badge>
                )}
              </CardTitle>
              <CardDescription>
                {language === 'so' ? 'Lacagaha suspicious-ka ah ee system-ku helay' : 'Suspicious payments detected automatically'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'so' ? 'Waqti' : 'Time'}</TableHead>
                  <TableHead>{language === 'so' ? 'Lambar' : 'Phone'}</TableHead>
                  <TableHead>{language === 'so' ? 'Lacag' : 'Amount'}</TableHead>
                  <TableHead>{language === 'so' ? 'Nooca' : 'Type'}</TableHead>
                  <TableHead>{language === 'so' ? 'Xaaladda' : 'Severity'}</TableHead>
                  <TableHead>{language === 'so' ? 'Status' : 'Status'}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts?.map((alert) => (
                  <TableRow key={alert.id} className={!alert.is_reviewed ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(alert.created_at), 'dd MMM HH:mm')}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{alert.sender_phone}</TableCell>
                    <TableCell className="font-semibold">${alert.amount}</TableCell>
                    <TableCell>{alertTypeBadge(alert.alert_type)}</TableCell>
                    <TableCell>{severityBadge(alert.severity)}</TableCell>
                    <TableCell>
                      {alert.is_reviewed ? (
                        <Badge className="bg-green-500/20 text-green-700"><CheckCircle className="h-3 w-3 mr-1" /> Reviewed</Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-700">⏳ Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => { setSelectedAlert(alert); setReviewNotes(alert.notes || ''); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!alerts || alerts.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {language === 'so' ? '✅ Wax fraud ah lama helin' : '✅ No fraud alerts detected'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-red-500" />
              Fraud Alert Detail
            </DialogTitle>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">{language === 'so' ? 'Lambar:' : 'Phone:'}</span> <span className="font-mono">{selectedAlert.sender_phone}</span></div>
                <div><span className="text-muted-foreground">{language === 'so' ? 'Lacag:' : 'Amount:'}</span> <span className="font-bold">${selectedAlert.amount}</span></div>
              </div>
              <div>{alertTypeBadge(selectedAlert.alert_type)} {severityBadge(selectedAlert.severity)}</div>
              {selectedAlert.description && (
                <p className="text-sm bg-muted p-2 rounded">{selectedAlert.description}</p>
              )}
              <Textarea
                placeholder={language === 'so' ? 'Qoraalkaaga...' : 'Your notes...'}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedAlert(null)}>
              {language === 'so' ? 'Ka noqo' : 'Cancel'}
            </Button>
            {selectedAlert && !selectedAlert.is_reviewed && (
              <Button onClick={() => reviewMutation.mutate({ id: selectedAlert.id, notes: reviewNotes })}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {language === 'so' ? 'Xaqiiji' : 'Mark Reviewed'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
