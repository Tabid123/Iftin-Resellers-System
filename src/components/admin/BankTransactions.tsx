import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  Banknote, RefreshCw, KeyRound, Search, CheckCircle2, XCircle, AlertCircle, Copy,
} from 'lucide-react';
import { AdminPagination, ADMIN_PAGE_SIZE } from './simple/AdminPagination';

interface BankTx {
  id: string;
  tran_no: string;
  tran_date_time: string | null;
  customer_name: string | null;
  tran_amt: number;
  parsed_sender_phone: string | null;
  parsed_receiver_phone: string | null;
  match_status: string;
  match_notes: string | null;
  matched_payment_id: string | null;
  narration: string | null;
  dr_cr: string | null;
  currency_code: string | null;
  created_at: string;
}

interface PendingPayment {
  id: string;
  sender_phone: string;
  receiver_phone: string;
  expected_amount: number;
  status: string;
  created_at: string;
}

const PERIODS = [
  { key: 'today', labelEn: 'Today', labelSo: 'Maanta' },
  { key: 'yesterday', labelEn: 'Yesterday', labelSo: 'Shalay' },
  { key: 'week', labelEn: 'This Week', labelSo: 'Isbuucan' },
  { key: 'month', labelEn: 'This Month', labelSo: 'Bishaan' },
  { key: 'all', labelEn: 'All', labelSo: 'Dhammaan' },
] as const;

type PeriodKey = (typeof PERIODS)[number]['key'];

export function BankTransactions({ isSo = true }: { isSo?: boolean }) {
  const { toast } = useToast();
  const [txs, setTxs] = useState<BankTx[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'matched' | 'unmatched' | 'ignored_debit' | 'failed_parse'>('all');
  const [stats, setStats] = useState({ total: 0, matched: 0, unmatched: 0, totalAmount: 0 });
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  // Credentials dialog
  const [credOpen, setCredOpen] = useState(false);
  const [credUsername, setCredUsername] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credSaving, setCredSaving] = useState(false);
  const [credCurrentUser, setCredCurrentUser] = useState<string>('');

  // Manual match dialog
  const [matchTx, setMatchTx] = useState<BankTx | null>(null);
  const [pendingCandidates, setPendingCandidates] = useState<PendingPayment[]>([]);
  const [matchSaving, setMatchSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  const periodStart = useCallback((p: PeriodKey): string | null => {
    const now = new Date();
    if (p === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (p === 'yesterday') {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    if (p === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString();
    }
    if (p === 'month') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d.toISOString();
    }
    return null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ps = periodStart(period);
      const from = page * ADMIN_PAGE_SIZE;
      const to = from + ADMIN_PAGE_SIZE - 1;

      let q = supabase
        .from('bank_transactions')
        .select('id,tran_no,tran_date_time,customer_name,tran_amt,parsed_sender_phone,parsed_receiver_phone,match_status,match_notes,matched_payment_id,narration,dr_cr,currency_code,created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (ps) q = q.gte('created_at', ps);
      if (statusFilter !== 'all') q = q.eq('match_status', statusFilter);
      if (search.trim()) {
        const term = search.trim().replace(/[%(),]/g, '');
        q = q.or(`tran_no.ilike.%${term}%,customer_name.ilike.%${term}%,parsed_sender_phone.ilike.%${term}%,parsed_receiver_phone.ilike.%${term}%,narration.ilike.%${term}%`);
      }

      const [pageRes, summaryRes] = await Promise.all([
        q,
        (supabase as any).rpc('get_admin_bank_transactions_summary', {
          p_start: ps,
          p_status: statusFilter === 'all' ? null : statusFilter,
          p_search: search.trim() || null,
        }),
      ]);

      if (pageRes.error) throw pageRes.error;
      if (summaryRes.error) throw summaryRes.error;

      setTxs((pageRes.data || []) as BankTx[]);
      setTotalRows(pageRes.count ?? 0);
      const summary = summaryRes.data || {};
      setStats({
        total: Number(summary.total || 0),
        matched: Number(summary.matched || 0),
        unmatched: Number(summary.unmatched || 0),
        totalAmount: Number(summary.total_amount || 0),
      });
    } catch (e: any) {
      console.error('load bank tx failed', e);
      toast({ title: isSo ? 'Khalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [period, statusFilter, search, page, periodStart, toast, isSo]);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [period, statusFilter, search]);

  useEffect(() => { setPage(0); }, [period, statusFilter, search]);

  // Realtime: refresh on insert/update
  useEffect(() => {
    const ch = supabase
      .channel('bank-tx-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bank_transactions' }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const loadCurrentCredential = useCallback(async () => {
    const { data } = await supabase
      .from('bank_credentials')
      .select('username')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setCredCurrentUser(data?.username || '');
    setCredUsername(data?.username || '');
  }, []);

  const openCredDialog = async () => {
    await loadCurrentCredential();
    setCredPassword('');
    setCredOpen(true);
  };

  const saveCredentials = async () => {
    if (!credUsername.trim() || credPassword.length < 6) {
      toast({
        title: isSo ? 'Khalad' : 'Error',
        description: isSo ? 'Username + password (>= 6 char) waa lagama maarmaan' : 'Username + password (>= 6 chars) required',
        variant: 'destructive',
      });
      return;
    }
    setCredSaving(true);
    try {
      // Use a SQL update via RPC? Simplest: update via supabase client with crypt() — but we can't run SQL functions directly.
      // Workaround: call the migration tool isn't possible at runtime. Instead, use a tiny RPC.
      const { error } = await supabase.rpc('set_bank_credential' as any, {
        p_username: credUsername.trim(),
        p_password: credPassword,
      });
      if (error) throw error;
      toast({
        title: isSo ? 'Guuleystay' : 'Saved',
        description: isSo ? 'Credentials-ka bank-ka waa la cusboonaysiiyay.' : 'Bank credentials updated.',
      });
      setCredOpen(false);
      await loadCurrentCredential();
    } catch (e: any) {
      toast({ title: isSo ? 'Khalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setCredSaving(false);
    }
  };

  const openManualMatch = async (tx: BankTx) => {
    setMatchTx(tx);
    setPendingCandidates([]);
    try {
      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('pending_online_payments')
        .select('id, sender_phone, receiver_phone, expected_amount, status, created_at')
        .eq('status', 'pending')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPendingCandidates((data || []) as PendingPayment[]);
    } catch (e: any) {
      toast({ title: isSo ? 'Khalad' : 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const confirmManualMatch = async (paymentId: string) => {
    if (!matchTx) return;
    setMatchSaving(true);
    try {
      // 1) mark pending payment matched
      const { error: e1 } = await supabase
        .from('pending_online_payments')
        .update({ status: 'matched', matched_at: new Date().toISOString() })
        .eq('id', paymentId);
      if (e1) throw e1;

      // 2) update bank tx
      const { error: e2 } = await supabase
        .from('bank_transactions')
        .update({
          match_status: 'manual_matched',
          matched_payment_id: paymentId,
          match_notes: 'Manually matched by admin',
          processed_at: new Date().toISOString(),
        })
        .eq('id', matchTx.id);
      if (e2) throw e2;

      // 3) trigger activate-package
      const { error: activationError } = await supabase.functions.invoke('activate-package', {
        body: { pendingPaymentId: paymentId, source: 'bank_manual', tranNo: matchTx.tran_no },
      });
      if (activationError) throw activationError;

      toast({ title: isSo ? 'Guuleystay' : 'Matched', description: isSo ? 'Lacagta waa la xirxiray dalabka.' : 'Payment linked to order.' });
      setMatchTx(null);
      load();
    } catch (e: any) {
      toast({ title: isSo ? 'Khalad' : 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setMatchSaving(false);
    }
  };

  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const loginUrl = `${supabaseUrl}/functions/v1/bank-login`;
  const pushUrl = `${supabaseUrl}/functions/v1/bank-push-transaction`;

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast({ title: isSo ? 'Koobi' : 'Copied', description: txt });
  };

  const statusBadge = (s: string) => {
    if (s === 'matched' || s === 'manual_matched') {
      return <Badge className="bg-green-500 hover:bg-green-600 gap-1"><CheckCircle2 className="h-3 w-3" />{s === 'manual_matched' ? (isSo ? 'Manual' : 'Manual') : (isSo ? 'Match' : 'Matched')}</Badge>;
    }
    if (s === 'unmatched') {
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 gap-1"><AlertCircle className="h-3 w-3" />{isSo ? 'Lama Helin' : 'Unmatched'}</Badge>;
    }
    if (s === 'ignored_debit') {
      return <Badge variant="outline" className="gap-1"><XCircle className="h-3 w-3" />{isSo ? 'Loo iska indhotirey' : 'Ignored'}</Badge>;
    }
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{s}</Badge>;
  };

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            <h2 className="font-bold text-base">{isSo ? 'Lacagaha Bank-ka' : 'Bank Transactions'}</h2>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {isSo ? 'Cusboonaysii' : 'Refresh'}
            </Button>
            <Button size="sm" onClick={openCredDialog} className="bg-emerald-600 hover:bg-emerald-700">
              <KeyRound className="h-4 w-4 mr-1" />
              {isSo ? 'Bank Credentials' : 'Bank Credentials'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card className="p-3 bg-blue-50 dark:bg-blue-950">
          <div className="text-xs text-blue-700 dark:text-blue-300">{isSo ? 'Wadarta' : 'Total'}</div>
          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</div>
        </Card>
        <Card className="p-3 bg-green-50 dark:bg-green-950">
          <div className="text-xs text-green-700 dark:text-green-300">{isSo ? 'Match' : 'Matched'}</div>
          <div className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.matched}</div>
        </Card>
        <Card className="p-3 bg-yellow-50 dark:bg-yellow-950">
          <div className="text-xs text-yellow-700 dark:text-yellow-300">{isSo ? 'Lama Helin' : 'Unmatched'}</div>
          <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">{stats.unmatched}</div>
        </Card>
        <Card className="p-3 bg-emerald-50 dark:bg-emerald-950">
          <div className="text-xs text-emerald-700 dark:text-emerald-300">{isSo ? 'Lacagta' : 'Amount'}</div>
          <div className="text-xl font-bold text-emerald-900 dark:text-emerald-100">${stats.totalAmount.toFixed(2)}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-3 space-y-2">
        <div className="flex flex-wrap gap-1">
          {PERIODS.map(p => (
            <Button
              key={p.key}
              size="sm"
              variant={period === p.key ? 'default' : 'outline'}
              onClick={() => setPeriod(p.key)}
            >
              {isSo ? p.labelSo : p.labelEn}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(['all', 'matched', 'unmatched', 'ignored_debit', 'failed_parse'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? 'default' : 'outline'}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? (isSo ? 'Dhammaan' : 'All') : s}
            </Button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder={isSo ? 'Raadi tran no, magac, taleefan...' : 'Search tran no, name, phone...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
      </Card>

      {/* API endpoints info */}
      <Card className="p-3 bg-gray-50 dark:bg-gray-800">
        <div className="text-xs font-semibold mb-2">{isSo ? 'API URLs (sii bank-ka)' : 'API URLs (give to bank)'}</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-medium w-16">Login:</span>
            <code className="flex-1 bg-white dark:bg-gray-900 px-2 py-1 rounded text-[10px] break-all">{loginUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(loginUrl)}><Copy className="h-3 w-3" /></Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium w-16">Push:</span>
            <code className="flex-1 bg-white dark:bg-gray-900 px-2 py-1 rounded text-[10px] break-all">{pushUrl}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(pushUrl)}><Copy className="h-3 w-3" /></Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tran No</TableHead>
                <TableHead>{isSo ? 'Wakhti' : 'Time'}</TableHead>
                <TableHead className="text-right">{isSo ? 'Lacag' : 'Amount'}</TableHead>
                <TableHead>{isSo ? 'Diraha' : 'Sender'}</TableHead>
                <TableHead>{isSo ? 'Qaataha' : 'Receiver'}</TableHead>
                <TableHead>{isSo ? 'Xaalad' : 'Status'}</TableHead>
                <TableHead>{isSo ? 'Falal' : 'Action'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txs.length === 0 && !loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-8">{isSo ? 'Wax lacag ah lama helin' : 'No transactions'}</TableCell></TableRow>
              )}
              {txs.map(tx => (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">{tx.tran_no}</TableCell>
                  <TableCell className="text-xs">
                    {tx.tran_date_time ? new Date(tx.tran_date_time).toLocaleString() : new Date(tx.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    ${Number(tx.tran_amt).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-xs">{tx.parsed_sender_phone || '—'}</TableCell>
                  <TableCell className="text-xs">{tx.parsed_receiver_phone || '—'}</TableCell>
                  <TableCell>{statusBadge(tx.match_status)}</TableCell>
                  <TableCell>
                    {tx.match_status === 'unmatched' && (
                      <Button size="sm" variant="outline" onClick={() => openManualMatch(tx)}>
                        {isSo ? 'Match Manual' : 'Manual Match'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      <AdminPagination page={page} total={totalRows} pageSize={ADMIN_PAGE_SIZE} onPageChange={setPage} isSo={isSo} />
      </Card>

      {/* Credentials Dialog */}
      <Dialog open={credOpen} onOpenChange={setCredOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isSo ? 'Bank Credentials' : 'Bank Credentials'}</DialogTitle>
            <DialogDescription>
              {isSo
                ? 'Username + Password ee bank-ku ku login gareyn doono. Beddel marka aad rabto.'
                : 'Username + Password the bank will use to log in. Update anytime.'}
              {credCurrentUser && (
                <div className="mt-2 text-xs">
                  {isSo ? 'Hadda:' : 'Current:'} <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{credCurrentUser}</code>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Username</Label>
              <Input value={credUsername} onChange={e => setCredUsername(e.target.value)} placeholder="najaxbank" />
            </div>
            <div>
              <Label>{isSo ? 'Password Cusub' : 'New Password'}</Label>
              <Input type="text" value={credPassword} onChange={e => setCredPassword(e.target.value)} placeholder={isSo ? 'Ugu yaraan 6 xaraf' : 'Min 6 chars'} />
              <p className="text-[10px] text-gray-500 mt-1">{isSo ? 'Password-ka kuma kaydsana qaab cad — bcrypt hash ah ayuu noqonaa.' : 'Password is stored as bcrypt hash.'}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredOpen(false)}>{isSo ? 'Jooji' : 'Cancel'}</Button>
            <Button onClick={saveCredentials} disabled={credSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {credSaving ? '...' : (isSo ? 'Kaydi' : 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Match Dialog */}
      <Dialog open={!!matchTx} onOpenChange={o => !o && setMatchTx(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isSo ? 'Manual Match' : 'Manual Match'}</DialogTitle>
            <DialogDescription>
              {isSo ? 'Door pending payment ku habboon lacagtan bank-ka.' : 'Choose pending payment to link to this bank tx.'}
            </DialogDescription>
          </DialogHeader>
          {matchTx && (
            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-xs space-y-1">
              <div><strong>Tran:</strong> {matchTx.tran_no}</div>
              <div><strong>{isSo ? 'Lacagta' : 'Amount'}:</strong> ${Number(matchTx.tran_amt).toFixed(2)}</div>
              <div><strong>{isSo ? 'Diraha' : 'Sender'}:</strong> {matchTx.parsed_sender_phone || '—'}</div>
              <div><strong>Narration:</strong> <code className="text-[10px]">{matchTx.narration}</code></div>
            </div>
          )}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendingCandidates.length === 0 && (
              <p className="text-center text-gray-400 py-6 text-sm">{isSo ? 'Wax pending payment ah ma jiraan' : 'No pending payments'}</p>
            )}
            {pendingCandidates.map(p => (
              <div key={p.id} className="border rounded p-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800">
                <div className="text-xs space-y-0.5">
                  <div><strong>{isSo ? 'Diraha' : 'Sender'}:</strong> {p.sender_phone}</div>
                  <div><strong>{isSo ? 'Qaataha' : 'Receiver'}:</strong> {p.receiver_phone}</div>
                  <div><strong>{isSo ? 'Lacag' : 'Amount'}:</strong> ${Number(p.expected_amount).toFixed(2)}</div>
                  <div className="text-gray-400">{new Date(p.created_at).toLocaleString()}</div>
                </div>
                <Button size="sm" disabled={matchSaving} onClick={() => confirmManualMatch(p.id)}>
                  {isSo ? 'Match' : 'Match'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BankTransactions;
