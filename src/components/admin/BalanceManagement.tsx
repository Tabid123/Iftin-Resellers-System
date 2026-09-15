import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Send, Wallet, RefreshCw, Loader2, Clock, CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatDistanceToNow } from 'date-fns';

interface SimBalance {
  id: string;
  balance: number;
  balance_type: string;
  last_updated: string;
  device_id: string;
  sim_slot: number | null;
}

interface AndroidDevice {
  id: string;
  device_name: string;
  sim_number: string;
  sim1_provider: string | null;
  sim2_provider: string | null;
  sim2_number: string | null;
}

type SendStep = 'form' | 'pin' | 'polling' | 'result';

export const BalanceManagement = () => {
  const { language } = useLanguage();
  const [balances, setBalances] = useState<SimBalance[]>([]);
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendPhone, setSendPhone] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  
  // New PIN + polling states
  const [sendStep, setSendStep] = useState<SendStep>('form');
  const [pinInput, setPinInput] = useState('');
  const [pollingQueueId, setPollingQueueId] = useState<string | null>(null);
  const [pollingResult, setPollingResult] = useState<{ status: string; response: string | null } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCountRef = useRef(0);

  useEffect(() => {
    loadData();

    // Real-time subscription for sim_balances updates
    const channel = supabase
      .channel('balance-management-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sim_balances' },
        async (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updatedBalance = payload.new as SimBalance;
            if (updatedBalance.balance_type === 'evc_plus') {
              setBalances(prev => {
                const exists = prev.find(b => b.id === updatedBalance.id);
                if (exists) {
                  return prev.map(b => b.id === updatedBalance.id ? { ...b, ...updatedBalance } : b);
                }
                return [updatedBalance, ...prev];
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [balRes, devRes] = await Promise.all([
      supabase.from('sim_balances').select('*').eq('balance_type', 'evc_plus').order('last_updated', { ascending: false }),
      supabase.from('android_devices').select('id, device_name, sim_number, sim1_provider, sim2_provider, sim2_number').is('archived_at', null),
    ]);
    
    const allDevices = devRes.data || [];
    const hormuudDevices = allDevices.filter(d => 
      d.sim1_provider?.toLowerCase().includes('hormuud') || 
      d.sim2_provider?.toLowerCase().includes('hormuud')
    );
    const hormuudDeviceIds = new Set(hormuudDevices.map(d => d.id));
    const hormuudBalances = (balRes.data || []).filter(b => hormuudDeviceIds.has(b.device_id));
    
    setBalances(hormuudBalances);
    setDevices(allDevices);
    setLoading(false);
  };

  const totalEvcBalance = balances.reduce((sum, b) => sum + Number(b.balance), 0);
  const lastUpdated = balances.length > 0 ? balances[0].last_updated : null;

  const hormuudDevice = devices.find(d => 
    d.device_name?.toLowerCase().includes('m31') && 
    (d.sim1_provider?.toLowerCase().includes('hormuud') || d.sim2_provider?.toLowerCase().includes('hormuud'))
  ) || devices.find(d => 
    d.sim1_provider?.toLowerCase().includes('hormuud') || 
    d.sim2_provider?.toLowerCase().includes('hormuud')
  );

  const resetDialog = () => {
    setSendStep('form');
    setPinInput('');
    setPollingQueueId(null);
    setPollingResult(null);
    pollingCountRef.current = 0;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleCloseDialog = () => {
    resetDialog();
    setSendPhone('');
    setSendAmount('');
    setShowSendDialog(false);
  };

  // Step 1: Form → PIN step
  const handleProceedToPin = () => {
    if (!sendPhone || !sendAmount) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: language === 'so' ? 'Fadlan gali lambarka iyo lacagta' : 'Please enter phone and amount', variant: 'destructive' });
      return;
    }
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: language === 'so' ? 'Lacagta saxda maaha' : 'Invalid amount', variant: 'destructive' });
      return;
    }
    let phone = sendPhone.replace(/\D/g, '');
    if (phone.startsWith('252')) phone = phone.substring(3);
    phone = phone.slice(-9);
    if (phone.length < 9) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: language === 'so' ? 'Lambarka saxda maaha' : 'Invalid phone number', variant: 'destructive' });
      return;
    }
    setSendStep('pin');
  };

  // Start polling delivery_queue status
  const startPolling = useCallback((queueId: string) => {
    setPollingQueueId(queueId);
    setSendStep('polling');
    pollingCountRef.current = 0;

    pollingRef.current = setInterval(async () => {
      pollingCountRef.current++;
      
      const { data } = await supabase
        .from('delivery_queue')
        .select('status, error_message, provider_response')
        .eq('id', queueId)
        .single();

      if (data && (data.status === 'completed' || data.status === 'failed')) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setPollingResult({
          status: data.status,
          response: (data as any).provider_response || data.error_message || null,
        });
        setSendStep('result');
      }

      // Max 60s (20 polls × 3s)
      if (pollingCountRef.current >= 20) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setPollingResult({
          status: 'timeout',
          response: language === 'so' ? 'Waqtigu dhacay - hubi Android app-ka' : 'Timeout - check Android app',
        });
        setSendStep('result');
      }
    }, 3000);
  }, [language]);

  // Step 2: PIN confirmed → send money
  const handleSendWithPin = async () => {
    const sanitizedPin = pinInput.replace(/\D/g, '').slice(0, 4);
    if (sanitizedPin.length !== 4) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: language === 'so' ? 'PIN-ku waa inuu noqdaa 4 lambar' : 'PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }

    const amount = parseFloat(sendAmount);
    let phone = sendPhone.replace(/\D/g, '');
    if (phone.startsWith('252')) phone = phone.substring(3);
    phone = phone.slice(-9);

    const formatAmount = (amt: number) => {
      if (Number.isInteger(amt)) return amt.toString();
      const formatted = amt.toFixed(2);
      if (amt < 1) return formatted.replace('.', '');
      return formatted.replace('.', '*');
    };

    const ussdCode = `*712*${phone}*${formatAmount(amount)}#`;

    let simSlot = 0;
    if (hormuudDevice) {
      if (hormuudDevice.sim2_provider?.toLowerCase().includes('hormuud')) {
        simSlot = 1;
      }
    }

    setSending(true);
    try {
      const { data, error } = await supabase.from('delivery_queue').insert({
        ussd_code: ussdCode,
        provider_name: 'hormuud',
        status: 'pending',
        receiver_phone: phone,
        sim_slot: simSlot,
        order_id: null,
        pin_code: sanitizedPin,
      } as any).select().single();

      if (error) throw error;

      toast({
        title: language === 'so' ? '📡 Dirayaa...' : '📡 Sending...',
        description: language === 'so' 
          ? `$${amount} → ${phone}. Android app-ka ayaa qaadanaya...` 
          : `$${amount} → ${phone}. Android app processing...`,
      });

      // Start polling for result
      startPolling((data as any).id);
    } catch (err: any) {
      toast({ title: language === 'so' ? 'Khalad' : 'Error', description: err.message, variant: 'destructive' });
      setSendStep('pin');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* EVC Plus Balance Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="h-6 w-6" />
              <h2 className="text-lg font-semibold">EVC Plus Balance</h2>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={loadData}
              className="text-white hover:bg-white/20"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="text-center py-4">
            <p className="text-white/70 text-sm mb-1">
              {language === 'so' ? 'Wadarta EVC Plus' : 'Total EVC Plus'}
            </p>
            <p className="text-6xl font-extrabold tracking-tight drop-shadow-lg">
              ${totalEvcBalance.toFixed(2)}
            </p>
          </div>

          {lastUpdated && (
            <div className="flex items-center justify-center gap-1 text-white/60 text-xs mt-2">
              <Clock className="h-3 w-3" />
              <span>
                {language === 'so' ? 'La cusbooneysiiyay' : 'Updated'}{' '}
                {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
              </span>
            </div>
          )}

          {balances.length > 1 && (
            <div className="mt-4 pt-4 border-t border-white/20 grid grid-cols-2 gap-3">
              {balances.map((b) => {
                  const dev = devices.find(d => d.id === b.device_id);
                return (
                  <div key={b.id} className="bg-white/10 rounded-lg p-3 text-center">
                    <p className="text-xs text-white/70">{dev?.device_name || 'SIM'} {b.sim_slot ? `(Slot ${b.sim_slot})` : ''}</p>
                    <p className="text-lg font-bold">${Number(b.balance).toFixed(2)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Send Money Button */}
      <Button 
        onClick={() => { resetDialog(); setShowSendDialog(true); }} 
        className="w-full h-14 text-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700"
        size="lg"
      >
        <Send className="h-5 w-5 mr-3" />
        {language === 'so' ? '💸 Dir Lacag (EVC Plus)' : '💸 Send Money (EVC Plus)'}
      </Button>

      {/* Send Money Dialog - Multi-step */}
      <Dialog open={showSendDialog} onOpenChange={(open) => { if (!open) handleCloseDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sendStep === 'result' && pollingResult?.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : sendStep === 'result' ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : sendStep === 'pin' ? (
                <KeyRound className="h-5 w-5 text-amber-500" />
              ) : (
                <Send className="h-5 w-5 text-emerald-500" />
              )}
              {sendStep === 'form' && (language === 'so' ? 'Dir Lacag - EVC Plus' : 'Send Money - EVC Plus')}
              {sendStep === 'pin' && (language === 'so' ? 'PIN-ka Gali' : 'Enter PIN')}
              {sendStep === 'polling' && (language === 'so' ? 'Sugitaan...' : 'Processing...')}
              {sendStep === 'result' && (language === 'so' ? 'Natiijada Hormuud' : 'Hormuud Response')}
            </DialogTitle>
          </DialogHeader>
          
          {/* Step 1: Phone + Amount */}
          {sendStep === 'form' && (
            <div className="space-y-4 py-4">
              <div>
                <Label>{language === 'so' ? 'Lambarka (qofka loo diraayo)' : 'Phone Number (recipient)'}</Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={sendPhone}
                  onChange={(e) => setSendPhone(e.target.value)}
                  placeholder="61XXXXXXX"
                  className="mt-1 text-lg font-mono"
                />
              </div>
              <div>
                <Label>{language === 'so' ? 'Lacagta (USD)' : 'Amount (USD)'}</Label>
                <Input
                  type="number"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 text-lg font-mono"
                  min="0"
                  step="0.01"
                />
              </div>
              {sendPhone && sendAmount && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">USSD Code</p>
                  <p className="font-mono text-sm font-bold">
                    *712*{sendPhone.replace(/\D/g, '').replace(/^252/, '').slice(-9)}*{sendAmount}#
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: PIN Entry */}
          {sendStep === 'pin' && (
            <div className="space-y-4 py-4">
              <div className="bg-muted rounded-lg p-3 text-center mb-2">
                <p className="text-xs text-muted-foreground mb-1">{language === 'so' ? 'Lacag u socota' : 'Sending to'}</p>
                <p className="font-mono text-sm font-bold">{sendPhone} → ${sendAmount}</p>
              </div>
              <div>
                <Label className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  {language === 'so' ? 'PIN-ka Hormuud' : 'Hormuud PIN'}
                </Label>
                <Input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="PIN"
                  className="mt-1 text-2xl font-mono text-center tracking-[0.5em]"
                  maxLength={4}
                  inputMode="numeric"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSendWithPin(); }}
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {language === 'so' ? 'PIN-ka Hormuud gali si lacagta loo diro' : 'Enter Hormuud PIN to send money'}
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Polling */}
          {sendStep === 'polling' && (
            <div className="py-8 flex flex-col items-center gap-4">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
              <p className="text-sm text-muted-foreground text-center">
                {language === 'so' 
                  ? 'Android app-ka ayaa USSD-ka galinaya...\nSugitaan natiijada Hormuud...' 
                  : 'Android app dialing USSD...\nWaiting for Hormuud response...'}
              </p>
              <p className="text-xs text-muted-foreground">
                {pollingCountRef.current > 0 && `${pollingCountRef.current * 3}s / 60s`}
              </p>
            </div>
          )}

          {/* Step 4: Result */}
          {sendStep === 'result' && pollingResult && (
            <div className="py-6 space-y-4">
              <div className={`rounded-lg p-4 text-center ${
                pollingResult.status === 'completed' 
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' 
                  : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
              }`}>
                {pollingResult.status === 'completed' ? (
                  <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
                ) : (
                  <XCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
                )}
                <p className="font-semibold text-lg mb-2">
                  {pollingResult.status === 'completed' 
                    ? (language === 'so' ? '✅ Guul!' : '✅ Success!') 
                    : pollingResult.status === 'timeout'
                    ? (language === 'so' ? '⏰ Waqtigu dhacay' : '⏰ Timeout')
                    : (language === 'so' ? '❌ Khalad' : '❌ Failed')}
                </p>
              </div>
              
              {pollingResult.response && (
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold">
                    {language === 'so' ? '📝 Natiijada Hormuud:' : '📝 Hormuud Response:'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{pollingResult.response}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {sendStep === 'form' && (
              <>
                <Button variant="outline" onClick={handleCloseDialog}>
                  {language === 'so' ? 'Ka noqo' : 'Cancel'}
                </Button>
                <Button 
                  onClick={handleProceedToPin} 
                  disabled={!sendPhone || !sendAmount}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600"
                >
                  {language === 'so' ? 'Sii wad →' : 'Continue →'}
                </Button>
              </>
            )}
            {sendStep === 'pin' && (
              <>
                <Button variant="outline" onClick={() => setSendStep('form')}>
                  {language === 'so' ? '← Dib u noqo' : '← Back'}
                </Button>
                <Button 
                  onClick={handleSendWithPin} 
                  disabled={sending || !pinInput.trim()}
                  className="bg-gradient-to-r from-emerald-500 to-teal-600"
                >
                  {sending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {language === 'so' ? 'Diraya...' : 'Sending...'}</>
                  ) : (
                    <><Send className="h-4 w-4 mr-2" /> {language === 'so' ? 'Xaqiiji & Dir' : 'Confirm & Send'}</>
                  )}
                </Button>
              </>
            )}
            {sendStep === 'polling' && (
              <Button variant="outline" onClick={handleCloseDialog}>
                {language === 'so' ? 'Xir' : 'Close'}
              </Button>
            )}
            {sendStep === 'result' && (
              <Button onClick={() => { handleCloseDialog(); }}>
                {language === 'so' ? 'Xir' : 'Close'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
