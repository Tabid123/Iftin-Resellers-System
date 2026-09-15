import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { Smartphone, Plus, RefreshCw, CreditCard, Wifi, WifiOff, Edit, Trash2 } from 'lucide-react';
import { AddDeviceDialog } from './AddDeviceDialog';
import { EditDeviceDialog } from './EditDeviceDialog';
import { DeleteDeviceDialog } from './DeleteDeviceDialog';

const DeviceCardSkeleton = () => (
  <Card className="relative">
    <div className="absolute top-4 right-4">
      <Skeleton className="h-4 w-14" />
    </div>
    <CardHeader className="pb-2">
      <Skeleton className="h-5 w-28 mb-2" />
      <Skeleton className="h-3 w-40" />
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
      <div className="flex justify-between border-t pt-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="border-t pt-2">
        <Skeleton className="h-3 w-32" />
      </div>
    </CardContent>
  </Card>
);

interface SimBalance {
  device_id?: string;
  sim_slot: number;
  balance: number;
  balance_type: string;
  last_updated: string;
}

export interface Device {
  id: string;
  device_id: string;
  device_name: string;
  sim_number: string;
  sim2_number: string | null;
  provider_name: string;
  sim1_provider: string | null;
  sim2_provider: string | null;
  is_active: boolean;
  is_primary_hormuud_sim?: boolean;
  total_deliveries: number;
  failed_deliveries: number;
  last_ping_at: string | null;
  balances?: SimBalance[];
}

interface DeviceManagementProps {
  onDevicesChange?: (devices: Device[]) => void;
}

export const DeviceManagement = ({ onDevicesChange }: DeviceManagementProps) => {
  const { language } = useLanguage();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const openEditDialog = (device: Device) => {
    setSelectedDevice(device);
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (device: Device) => {
    setSelectedDevice(device);
    setDeleteDialogOpen(true);
  };

  // Initial load
  useEffect(() => {
    loadDevices(true);
  }, []);

  // Supabase Realtime subscription - single-row patching (zero full refetch)
  useEffect(() => {
    const channel = supabase
      .channel('device-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'android_devices'
        },
        (payload) => {
          console.log('Device INSERT received:', payload);
          const newDevice = { ...payload.new, balances: [] } as unknown as Device;
          if (!(payload.new as any).archived_at) {
            setDevices(prev => [...prev, newDevice]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'android_devices'
        },
        (payload) => {
          console.log('Device UPDATE received:', payload);
          const updated = payload.new as any;
          if (updated.archived_at) {
            // Device was archived - remove from list
            setDevices(prev => prev.filter(d => d.id !== updated.id));
          } else {
            setDevices(prev => prev.map(d => 
              d.id === updated.id 
                ? { ...d, ...updated, balances: d.balances } 
                : d
            ));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'android_devices'
        },
        (payload) => {
          console.log('Device DELETE received:', payload);
          setDevices(prev => prev.filter(d => d.id !== (payload.old as any).id));
        }
      )
      .subscribe();

    // SIM balances realtime - patch balance into device state
    const balancesChannel = supabase
      .channel('device-balances-mgmt')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sim_balances'
        },
        (payload) => {
          console.log('Balance update received:', payload);
          const balanceRow = (payload.new || payload.old) as any;
          if (!balanceRow?.device_id) return;
          
          setDevices(prev => prev.map(d => {
            if (d.id !== balanceRow.device_id) return d;
            const existingBalances = d.balances || [];
            if (payload.eventType === 'DELETE') {
              return { ...d, balances: existingBalances.filter(b => 
                !(b.sim_slot === balanceRow.sim_slot && b.balance_type === balanceRow.balance_type)
              )};
            }
            const newBalance = {
              sim_slot: balanceRow.sim_slot || 1,
              balance: balanceRow.balance,
              balance_type: balanceRow.balance_type,
              last_updated: balanceRow.last_updated,
            };
            const idx = existingBalances.findIndex(b => 
              b.sim_slot === newBalance.sim_slot && b.balance_type === newBalance.balance_type
            );
            const updatedBalances = idx >= 0 
              ? existingBalances.map((b, i) => i === idx ? newBalance : b)
              : [...existingBalances, newBalance];
            return { ...d, balances: updatedBalances };
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(balancesChannel);
    };
  }, []);

  // Notify parent when devices change
  useEffect(() => {
    onDevicesChange?.(devices);
  }, [devices, onDevicesChange]);

  const loadDevices = async (showSkeleton = false) => {
    if (showSkeleton) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
    try {
      // Fetch devices
      const { data: devicesData, error: devicesError } = await supabase
        .from('android_devices')
        .select('*')
        .is('archived_at', null)
        .order('device_name');

      if (devicesError) throw devicesError;

      // Fetch all balances for active devices
      const deviceIds = devicesData?.map(d => d.id) || [];
      let balancesData: SimBalance[] = [];
      
      if (deviceIds.length > 0) {
        const { data: balances, error: balancesError } = await supabase
          .from('sim_balances')
            .select('device_id, sim_slot, balance, balance_type, last_updated')
            .in('device_id', deviceIds);
        
        if (!balancesError && balances) {
          balancesData = balances as any[];
        }
      }

      // Merge balances into devices
      const devicesWithBalances = (devicesData || []).map(device => ({
        ...device,
        balances: balancesData
          .filter((b: any) => b.device_id === device.id)
          .map((b: any) => ({
            sim_slot: b.sim_slot,
            balance: b.balance,
            balance_type: b.balance_type,
            last_updated: b.last_updated
          }))
      }));

      setDevices(devicesWithBalances as Device[]);
    } catch (error: any) {
      console.error('Error loading devices:', error);
      toast({
        title: language === 'so' ? 'Khalad' : 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const isDeviceOnline = (lastPing: string | null) => {
    if (!lastPing) return false;
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    return new Date(lastPing).getTime() > twoMinutesAgo;
  };

  const getProviderBadgeColor = (provider: string | null) => {
    if (!provider) return 'bg-muted text-muted-foreground';
    const p = provider.toLowerCase();
    if (p.includes('hormuud')) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    if (p.includes('somnet')) return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    if (p.includes('somtel')) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (p.includes('amtel')) return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    if (p.includes('somlink')) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Smartphone className="h-6 w-6" />
            {language === 'so' ? 'Maamulka Phone-yada' : 'Device Management'}
          </h2>
          <p className="text-muted-foreground">
            {language === 'so' 
              ? 'Phone-yada Najax Delivery iyo SIM-yadiisa'
              : 'Najax Delivery phones and their SIM configurations'
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadDevices(false)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {language === 'so' ? 'Cusboonsii' : 'Refresh'}
          </Button>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {language === 'so' ? 'Ku Dar Phone' : 'Add Device'}
          </Button>
        </div>
      </div>

      {/* Device Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <>
            <DeviceCardSkeleton />
            <DeviceCardSkeleton />
            <DeviceCardSkeleton />
          </>
        ) : devices.map((device) => {
          const isOnline = isDeviceOnline(device.last_ping_at);
          
          return (
            <Card key={device.id} className={`relative ${!device.is_active ? 'opacity-60' : ''}`}>
              {/* Action Buttons & Online Status */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <div className="flex gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7"
                    onClick={() => openEditDialog(device)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog(device)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {isOnline ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <Wifi className="h-4 w-4" />
                    <span className="text-xs font-medium">Online</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <WifiOff className="h-4 w-4" />
                    <span className="text-xs">Offline</span>
                  </div>
                )}
              </div>

              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{device.device_name}</CardTitle>
                <CardDescription className="text-xs font-mono">
                  ID: {device.device_id}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* SIM Configuration with Balances */}
                <div className="space-y-2">
                  {/* SIM 1 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">SIM 1:</span>
                      <Badge className={getProviderBadgeColor(device.sim1_provider)}>
                        {device.sim1_provider || device.provider_name || 'Not set'}
                      </Badge>
                    </div>
                    {/* SIM 1 Balance - Provider-based */}
                    {(() => {
                      const provider = (device.sim1_provider || '').toLowerCase();
                      const isHormuud = provider.includes('hormuud');
                      
                      if (isHormuud) {
                        const evcBalance = device.balances?.find(b => b.sim_slot === 1 && b.balance_type === 'evc_plus');
                        const evoucherBalance = device.balances?.find(b => b.sim_slot === 1 && b.balance_type === 'evoucher');
                        return (
                          <div className="flex flex-col items-end gap-0.5">
                            {evcBalance && (
                              <span className="text-xs">
                                EVC: <span className={evcBalance.balance > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>${evcBalance.balance.toFixed(2)}</span>
                              </span>
                            )}
                            {evoucherBalance && (
                              <span className="text-xs">
                                E-Voucher: <span className={evoucherBalance.balance > 0 ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}>${evoucherBalance.balance.toFixed(2)}</span>
                              </span>
                            )}
                          </div>
                        );
                      } else {
                        // Somtel, Amtel, Somnet: Use evoucher (data credit) - they don't use evc_plus
                        const sim1Balances = device.balances?.filter(b => b.sim_slot === 1) || [];
                        const evoucherBalance = sim1Balances.find(b => b.balance_type === 'evoucher');
                        const evcBalance = sim1Balances.find(b => b.balance_type === 'evc_plus');
                        
                        // Use evoucher if available with positive balance, otherwise evc_plus fallback
                        const bestBalance = evoucherBalance?.balance && evoucherBalance.balance > 0 
                          ? evoucherBalance 
                          : evcBalance;
                          
                        return (
                          <span className={`text-sm font-semibold ${bestBalance && bestBalance.balance > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                            ${bestBalance?.balance.toFixed(2) || '0.00'}
                          </span>
                        );
                      }
                    })()}
                  </div>
                  
                  {/* SIM 2 */}
                  {device.sim2_provider && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">SIM 2:</span>
                        <Badge className={getProviderBadgeColor(device.sim2_provider)}>
                          {device.sim2_provider}
                        </Badge>
                      </div>
                      {/* SIM 2 Balance - Provider-based */}
                      {(() => {
                        const provider = (device.sim2_provider || '').toLowerCase();
                        const isHormuud = provider.includes('hormuud');
                        
                        if (isHormuud) {
                          const evcBalance = device.balances?.find(b => b.sim_slot === 2 && b.balance_type === 'evc_plus');
                          const evoucherBalance = device.balances?.find(b => b.sim_slot === 2 && b.balance_type === 'evoucher');
                          return (
                            <div className="flex flex-col items-end gap-0.5">
                              {evcBalance && (
                                <span className="text-xs">
                                  EVC: <span className={evcBalance.balance > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>${evcBalance.balance.toFixed(2)}</span>
                                </span>
                              )}
                              {evoucherBalance && (
                                <span className="text-xs">
                                  E-Voucher: <span className={evoucherBalance.balance > 0 ? 'text-blue-600 font-semibold' : 'text-muted-foreground'}>${evoucherBalance.balance.toFixed(2)}</span>
                                </span>
                              )}
                            </div>
                          );
                        } else {
                          // Somtel, Amtel, Somnet: Use evoucher (data credit) - they don't use evc_plus
                          const sim2Balances = device.balances?.filter(b => b.sim_slot === 2) || [];
                          const evoucherBalance = sim2Balances.find(b => b.balance_type === 'evoucher');
                          const evcBalance = sim2Balances.find(b => b.balance_type === 'evc_plus');
                          
                          // Use evoucher if available with positive balance, otherwise evc_plus fallback
                          const bestBalance = evoucherBalance?.balance && evoucherBalance.balance > 0 
                            ? evoucherBalance 
                            : evcBalance;
                            
                          return (
                            <span className={`text-sm font-semibold ${bestBalance && bestBalance.balance > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                              ${bestBalance?.balance.toFixed(2) || '0.00'}
                            </span>
                          );
                        }
                      })()}
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="flex justify-between text-sm border-t pt-3">
                  <div>
                    <span className="text-muted-foreground">
                      {language === 'so' ? 'La diray:' : 'Delivered:'}
                    </span>
                    <span className="ml-1 font-semibold text-green-600">
                      {device.total_deliveries || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      {language === 'so' ? 'Fashilmay:' : 'Failed:'}
                    </span>
                    <span className="ml-1 font-semibold text-red-600">
                      {device.failed_deliveries || 0}
                    </span>
                  </div>
                </div>

                {/* Last Seen */}
                {device.last_ping_at && (
                  <p className="text-xs text-muted-foreground border-t pt-2">
                    {language === 'so' ? 'Markii ugu dambeysay:' : 'Last seen:'}{' '}
                    {formatDistanceToNow(new Date(device.last_ping_at), { addSuffix: true })}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
        }

        {/* Empty State */}
        {!loading && devices.length === 0 && (
          <div className="col-span-full text-center py-12">
            <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {language === 'so' ? 'Wax phone ah lama helin' : 'No devices found'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {language === 'so' 
                ? 'Ku dar phone cusub si aad u bilowdo'
                : 'Add a new device to get started'
              }
            </p>
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              {language === 'so' ? 'Ku Dar Phone' : 'Add Device'}
            </Button>
          </div>
        )}
      </div>

      {/* Add Device Dialog */}
      <AddDeviceDialog 
        open={addDialogOpen} 
        onOpenChange={setAddDialogOpen}
        onDeviceAdded={loadDevices}
      />

      {/* Edit Device Dialog */}
      <EditDeviceDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        device={selectedDevice}
        onSuccess={() => loadDevices(false)}
      />

      {/* Delete Device Dialog */}
      <DeleteDeviceDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        device={selectedDevice}
        onSuccess={() => loadDevices(false)}
      />
    </div>
  );
};
