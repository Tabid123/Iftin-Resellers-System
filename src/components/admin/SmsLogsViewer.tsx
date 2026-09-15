import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Loader2, ArrowDownLeft, ArrowUpRight, Smartphone, RefreshCw, MessageSquare, CalendarDays, ArrowLeft, ChevronRight, Search, Trash2, X } from 'lucide-react';

interface SmsLog {
  id: string;
  device_id: string;
  sim_slot: number;
  sim_number: string | null;
  sms_type: string;
  sms_sender: string | null;
  sms_body: string;
  amount: number | null;
  tx_type: string | null;
  tx_id: string | null;
  counterpart_phone: string | null;
  created_at: string;
  received_at: string;
}

// Provider detection from SMS sender codes
const getProviderFromSender = (sender: string): string | null => {
  const s = sender?.toLowerCase()?.trim() || '';
  if (['801', '898', 'somnet'].includes(s)) return 'Somnet';
  if (['192', '740'].includes(s)) return 'Hormuud';
  if (['reseller', '252888', 'edahab'].includes(s)) return 'Somtel';
  if (s === '913') return 'Amtel';
  return null;
};

const getProviderColor = (provider: string | null): string => {
  switch (provider) {
    case 'Somnet': return 'from-purple-500/20 to-purple-600/10 border-purple-300 dark:border-purple-700';
    case 'Hormuud': return 'from-orange-500/20 to-orange-600/10 border-orange-300 dark:border-orange-700';
    case 'Somtel': return 'from-blue-500/20 to-blue-600/10 border-blue-300 dark:border-blue-700';
    case 'Amtel': return 'from-green-500/20 to-green-600/10 border-green-300 dark:border-green-700';
    default: return 'from-muted/50 to-muted/30 border-border';
  }
};

const getProviderTextColor = (provider: string | null): string => {
  switch (provider) {
    case 'Somnet': return 'text-purple-700 dark:text-purple-300';
    case 'Hormuud': return 'text-orange-700 dark:text-orange-300';
    case 'Somtel': return 'text-blue-700 dark:text-blue-300';
    case 'Amtel': return 'text-green-700 dark:text-green-300';
    default: return 'text-foreground';
  }
};

const SmsLogsViewer = () => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [devices, setDevices] = useState<{ device_id: string; device_name: string; sim_number: string; sim2_number: string | null }[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('all');
  const [selectedTxType, setSelectedTxType] = useState<string>('all');
  const [selectedSmsType, setSelectedSmsType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedSenderCode, setSelectedSenderCode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchDevices = async () => {
      const { data } = await supabase
        .from('android_devices')
        .select('device_id, device_name, sim_number, sim2_number')
        .eq('is_active', true);
      setDevices(data || []);
    };
    fetchDevices();
  }, []);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('sms_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (selectedDevice !== 'all') {
        query = query.eq('device_id', selectedDevice);
      }
      if (selectedTxType !== 'all') {
        query = query.eq('tx_type', selectedTxType);
      }
      if (selectedSmsType !== 'all') {
        query = query.eq('sms_type', selectedSmsType);
      }
      if (dateRange?.from) {
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        const endDate = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
        endDate.setHours(23, 59, 59, 999);
        query = query.gte('created_at', start.toISOString()).lte('created_at', endDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs((data as SmsLog[]) || []);
    } catch (err) {
      console.error('Error fetching SMS logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    setSelectedIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDevice, selectedTxType, selectedSmsType, dateRange?.from, dateRange?.to]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('sms-logs-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_logs' }, (payload) => {
        const newLog = payload.new as SmsLog;
        if (selectedDevice !== 'all' && newLog.device_id !== selectedDevice) return;
        if (selectedTxType !== 'all' && newLog.tx_type !== selectedTxType) return;
        if (selectedSmsType !== 'all' && newLog.sms_type !== selectedSmsType) return;
        setLogs(prev => [newLog, ...prev].slice(0, 500));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'sms_logs' }, (payload) => {
        const oldLog = payload.old as SmsLog;
        setLogs(prev => prev.filter(l => l.id !== oldLog.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedDevice, selectedTxType, selectedSmsType]);

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase.from('sms_logs').delete().in('id', ids);
      if (error) throw error;
      setLogs(prev => prev.filter(l => !selectedIds.has(l.id)));
      setSelectedIds(new Set());
      toast({ title: 'La tirtiray', description: `${ids.length} SMS ayaa la tirtiray.` });
    } catch (e: any) {
      toast({ title: 'Khalad', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  };

  const getDeviceName = (deviceId: string) => {
    const device = devices.find(d => d.device_id === deviceId);
    return device?.device_name || deviceId;
  };

  const getSmartDirection = (log: SmsLog): string => {
    const body = log.sms_body?.toLowerCase() || '';
    if (body.includes('ugu shubtay')) return 'outgoing';
    if (body.includes('ka heshay')) return 'incoming';
    return log.sms_type;
  };


  // Search filter on SMS messages
  const searchFilteredLogs = searchQuery
    ? logs.filter(l => {
        const q = searchQuery.toLowerCase();
        return (l.counterpart_phone?.toLowerCase().includes(q)) ||
               (l.sms_body?.toLowerCase().includes(q)) ||
               (l.tx_id?.toLowerCase().includes(q)) ||
               (l.sms_sender?.toLowerCase().includes(q));
      })
    : logs;

  // Group logs by sender code (use search-filtered)
  const senderGroups2 = searchFilteredLogs.reduce<Record<string, SmsLog[]>>((acc, log) => {
    const sender = log.sms_sender || 'Unknown';
    if (!acc[sender]) acc[sender] = [];
    acc[sender].push(log);
    return acc;
  }, {});

  const sortedCodes2 = Object.keys(senderGroups2).sort((a, b) => {
    const provA = getProviderFromSender(a);
    const provB = getProviderFromSender(b);
    if (provA && !provB) return -1;
    if (!provA && provB) return 1;
    return senderGroups2[b].length - senderGroups2[a].length;
  });

  const filteredLogs = selectedSenderCode ? (senderGroups2[selectedSenderCode] || []) : [];

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Lambar raadi... (phone, TX ID)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 text-xs pl-8"
        />
      </div>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-2">
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {devices.map(d => (
              <SelectItem key={d.device_id} value={d.device_id}>{d.device_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTxType} onValueChange={setSelectedTxType}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="evc_plus">EVC Plus</SelectItem>
            <SelectItem value="evoucher">E-Voucher Jeeb</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedSmsType} onValueChange={setSelectedSmsType}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="incoming">Soo galay</SelectItem>
            <SelectItem value="outgoing">Ka baxay</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                'h-9 px-2 text-xs justify-start gap-1 col-span-1',
                !dateRange?.from && 'text-muted-foreground'
              )}
            >
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {dateRange?.from
                  ? dateRange.to
                    ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`
                    : format(dateRange.from, 'MMM d, y')
                  : 'Taariikh'}
              </span>
              {dateRange?.from && (
                <X
                  className="h-3 w-3 ml-auto shrink-0 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); setDateRange(undefined); }}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              numberOfMonths={1}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Refresh + Selection toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{logs.length} SMS</p>
          {selectedSenderCode && filteredLogs.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="sms-select-all"
                checked={filteredLogs.length > 0 && filteredLogs.every(l => selectedIds.has(l.id))}
                onCheckedChange={(checked) => {
                  if (checked) setSelectedIds(new Set(filteredLogs.map(l => l.id)));
                  else setSelectedIds(new Set());
                }}
              />
              <label htmlFor="sms-select-all" className="text-xs text-muted-foreground cursor-pointer">
                Dhammaan
              </label>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectedIds.size > 0 && (
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
                    Ma hubtaa inaad tirtirto {selectedIds.size} SMS? Database-ka ayaa laga saari doonaa, lamana soo celin karo.
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
          <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={isLoading} className="h-8 text-xs">
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Wali SMS kama soo gelin</p>
          </CardContent>
        </Card>
      ) : !selectedSenderCode ? (
        /* === SENDER CODES LIST === */
        <div className="space-y-2">
          {sortedCodes2.map(code => {
            const provider = getProviderFromSender(code);
            const count = senderGroups2[code].length;
            const lastLog = senderGroups2[code][0];
            const totalAmount = senderGroups2[code].reduce((sum, l) => sum + (l.amount || 0), 0);

            return (
              <div
                key={code}
                className="cursor-pointer hover:scale-[1.02] transition-transform"
                onClick={() => setSelectedSenderCode(code)}
              >
                {/* Code number - big colored box */}
                <div className={`rounded-t-lg bg-gradient-to-r ${getProviderColor(provider)} px-4 py-3 flex items-center justify-between`}>
                  <span className={`text-2xl font-extrabold ${getProviderTextColor(provider)}`}>{code}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {count} SMS
                    </Badge>
                    {totalAmount > 0 && /^\d+$/.test(code) && (
                      <span className="text-xs font-semibold text-green-600 dark:text-green-400">
                        ${totalAmount.toLocaleString()}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                {/* Provider name - bottom bar */}
                <div className="rounded-b-lg bg-muted/60 dark:bg-muted/30 border border-t-0 border-border px-4 py-1.5">
                  <span className={`text-xs font-semibold ${getProviderTextColor(provider)}`}>
                    {provider || 'Aan la aqoon'}
                  </span>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {lastLog.sms_body.substring(0, 70)}...
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* === MESSAGES FOR SELECTED CODE === */
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSenderCode(null)}
            className="h-8 text-xs gap-1 -ml-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dhamaan Codes
          </Button>

          <div className={`rounded-lg p-2 bg-gradient-to-r ${getProviderColor(getProviderFromSender(selectedSenderCode))}`}>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${getProviderTextColor(getProviderFromSender(selectedSenderCode))}`}>
                {selectedSenderCode}
              </span>
              {getProviderFromSender(selectedSenderCode) && (
                <Badge variant="secondary" className="text-[10px]">
                  {getProviderFromSender(selectedSenderCode)}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {filteredLogs.length} SMS
              </Badge>
            </div>
          </div>

          {filteredLogs.map(log => (
            <Card key={log.id} className={cn('overflow-hidden', selectedIds.has(log.id) && 'ring-1 ring-primary border-primary')}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selectedIds.has(log.id)}
                      onCheckedChange={() => toggleOne(log.id)}
                      className="shrink-0"
                    />
                    <div className={`p-1.5 rounded-full shrink-0 ${
                      getSmartDirection(log) === 'incoming' 
                        ? 'bg-green-100 dark:bg-green-900/40' 
                        : 'bg-red-100 dark:bg-red-900/40'
                    }`}>
                      {getSmartDirection(log) === 'incoming' 
                        ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        : <ArrowUpRight className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {log.counterpart_phone && (
                          <span className="text-sm font-semibold truncate">{log.counterpart_phone}</span>
                        )}
                        {log.amount != null && (
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">${log.amount}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          SIM {log.sim_slot}
                        </Badge>
                        {log.sim_number && (
                          <span className="text-[10px] text-muted-foreground">{log.sim_number}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{formatTime(log.created_at)}</span>
                </div>
                
                <div className="mt-2 bg-muted/50 rounded-md px-2.5 py-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">{log.sms_body}</p>
                </div>

                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Smartphone className="h-3 w-3" />
                    {getDeviceName(log.device_id)}
                  </div>
                  {log.tx_id && (
                    <span className="text-[10px] text-muted-foreground">TX: {log.tx_id}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SmsLogsViewer;
