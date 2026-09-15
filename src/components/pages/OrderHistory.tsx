import React, { useState, useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase, getTenantId } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import { generateInvoiceImage } from '@/utils/invoiceGenerator';
import { downloadBlobInBrowser } from '@/utils/downloadFile';
import { fetchIftinCatalog, hasCatalog, mapProviders } from '@/lib/iftinCatalog';
import { sellPriceFor } from '@/lib/resellerOverrides';
import { fetchIftinIntentStatus, isIntentPending } from '@/lib/iftinIntent';
import CachedImage from '@/components/CachedImage';

// Helper function to get invoice image - uses cached URL if available, otherwise generates on-demand
const getInvoiceBlob = async (order: any): Promise<Blob> => {
  // If order has a cached invoice URL, fetch it
  if (order.invoice_url) {
    try {
      const response = await fetch(order.invoice_url);
      if (response.ok) {
        return await response.blob();
      }
    } catch (error) {
      console.log('Failed to fetch cached invoice, generating on-demand:', error);
    }
  }
  
  // Fallback: Generate invoice on-demand
  return generateInvoiceImage(order);
};

const PENDING_STATES = ['pending', 'processing', 'matched', 'delivering', 'awaiting_payment', 'pending_payment'];

const normalizeSomaliPhone = (phone?: string | null) => (phone || '').replace(/^\+252/, '').trim();

/** Kayd degdeg ah: markii aad ku soo laabato bogga, xogtii hore ayaa isla markiiba muuqata. */
let historyCache: any[] | null = null;

const OrderHistory = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [orderHistory, setOrderHistory] = useState<any[]>(historyCache ?? []);
  const [loading, setLoading] = useState(!historyCache);
  // Show AdMob banner on mount, hide on unmount
  useEffect(() => {
    showBannerAd();
    return () => {
      hideBannerAd();
    };
  }, []);

  useEffect(() => {
    const fetchOrderHistory = async () => {
      const verifiedPhone = localStorage.getItem('verifiedPhone');
      const offlineSenderPhone = localStorage.getItem('offlineSenderPhone');
      
      if (!verifiedPhone && !offlineSenderPhone) {
        setLoading(false);
        return;
      }
      try {
        // Shirkadaha (magac + logo) waxaa laga soo qaataa catalog-ka API-ga,
        // sababtoo ah resellers-ka api_partner ma laha providers_config maxalli ah.
        const catalog = await fetchIftinCatalog().catch(() => null);
        const providerMap = new Map<string, any>();
        if (hasCatalog(catalog)) {
          for (const p of mapProviders(catalog!)) providerMap.set(String(p.id), p);
        }

        // Get all possible phone numbers to search for
        const phonesToSearch = [...new Set([
          normalizeSomaliPhone(verifiedPhone),
          normalizeSomaliPhone(offlineSenderPhone)
        ].filter(Boolean))];

        const orderChunks = await Promise.all(
          phonesToSearch.map(async (phone) => {
            const { data, error } = await (supabase as any).rpc('get_customer_order_history', {
              customer_phone_number: phone,
              p_tenant_id: getTenantId()
            });

            if (error) throw error;
            return data || [];
          })
        );

        const ordersData = [...new Map(
          orderChunks
            .flat()
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .map((order: any) => [order.id, order])
        ).values()];
        
        const formattedHistory = ordersData.map((order: any) => {
          const orderDate = new Date(order.created_at);
          const fromCatalog = order.provider_id ? providerMap.get(String(order.provider_id)) : null;
          // Qiimaha la tusayo waa sell price-ka reseller-ka (override haddii jiro).
          const sellPrice = order.package_id
            ? sellPriceFor(String(order.package_id), Number(order.selling_price ?? 0))
            : Number(order.selling_price ?? 0);
          
          // Calculate expiry date by adding validity period from the package to the order date
          let expiryDate = new Date(orderDate);
          if (order.validity_days) {
            const validityString = String(order.validity_days).toLowerCase().trim();
            const validityMatch = validityString.match(/\d+/);
            
            if (validityMatch) {
              const validityValue = parseInt(validityMatch[0], 10);
              if (!isNaN(validityValue) && validityValue > 0) {
                // Check if it's hours (saac in Somali or hour/hours in English) - CHECK FIRST
                if (validityString.includes('saac') || validityString.includes('hour')) {
                  // Add hours
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 60 * 60 * 1000));
                  console.log('Adding hours:', validityValue, 'to', orderDate, 'result:', expiryDate);
                } 
                // Check if it's weeks (usbuuc in Somali or week in English)
                else if (validityString.includes('usbuuc') || validityString.includes('week')) {
                  // Add weeks
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 7 * 24 * 60 * 60 * 1000));
                  console.log('Adding weeks:', validityValue);
                }
                // Check if it's months (bil in Somali or month in English)
                else if (validityString.includes('bil') || validityString.includes('month')) {
                  // Add months
                  expiryDate = new Date(orderDate);
                  expiryDate.setMonth(expiryDate.getMonth() + validityValue);
                  console.log('Adding months:', validityValue);
                }
                else {
                  // Default to days (maalin in Somali or day in English)
                  expiryDate = new Date(orderDate.getTime() + (validityValue * 24 * 60 * 60 * 1000));
                  console.log('Adding days:', validityValue);
                }
              }
            }
          }
          
          return {
            id: order.id,
            provider: order.provider_name || fromCatalog?.provider_name || 'Unknown',
            logo: order.provider_logo || fromCatalog?.provider_logo || null,
            package: order.package_name,
            phone: order.receiver_phone,
            senderPhone: order.sender_phone || order.customer_phone,
            receiverPhone: order.receiver_phone,
            price: `$${Number(sellPrice).toFixed(2)}`,
            date: format(orderDate, 'dd/MM/yyyy'),
            dateTime: format(orderDate, 'dd/MM/yyyy-hh:mmaaa'),
            expiryDateTime: format(expiryDate, 'dd/MM/yyyy-hh:mmaaa'),
            transactionId: order.id.slice(0, 8).toUpperCase(),
            status: order.status,
            delivery_status: order.delivery_status || order.status,
            invoice_url: order.invoice_url || null,
            payment_source: order.payment_source || null,
            external_ref: order.external_ref || null
          };
        });
        setOrderHistory(formattedHistory);
        historyCache = formattedHistory;

        // Natiijada dalabka (delivered / failed) waxaa laga soo qaataa API-ga
        // dalabyada aan wali dhammaystirneyn.
        const liveRefs = formattedHistory
          .filter((o: any) => o.external_ref && isIntentPending(o.delivery_status))
          .slice(0, 5);
        if (liveRefs.length) {
          const results = await Promise.all(
            liveRefs.map(async (o: any) => {
              try {
                const s = await fetchIftinIntentStatus(o.external_ref);
                return { id: o.id, status: s.delivery_status || s.status };
              } catch {
                return null;
              }
            }),
          );
          const updates = new Map(
            results.filter(Boolean).map((r: any) => [r.id, r.status]),
          );
          if (updates.size) {
            setOrderHistory((prev) => {
              const next = prev.map((o: any) =>
                updates.has(o.id) ? { ...o, delivery_status: updates.get(o.id) } : o,
              );
              historyCache = next;
              return next;
            });
          }
        }
      } catch (error) {
        console.error('Error fetching orders:', error);
        toast({
          title: 'Error',
          description: 'Failed to load order history',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchOrderHistory();
    
    const verifiedPhone = localStorage.getItem('verifiedPhone');
    const offlineSenderPhone = localStorage.getItem('offlineSenderPhone');
    
    if (!verifiedPhone && !offlineSenderPhone) return;
    
    const phonesToListen: string[] = [];
    if (verifiedPhone) {
      phonesToListen.push(normalizeSomaliPhone(verifiedPhone));
    }
    if (offlineSenderPhone) {
      phonesToListen.push(normalizeSomaliPhone(offlineSenderPhone));
    }
    
    const channel = supabase.channel('order-changes').on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'orders'
    }, (payload) => {
      // Check if the change is relevant to any of our phone numbers
      const order = payload.new as any;
      if (order && (
        phonesToListen.includes(normalizeSomaliPhone(order.customer_phone)) || 
        phonesToListen.includes(normalizeSomaliPhone(order.sender_phone))
      )) {
        fetchOrderHistory();
      }
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);
  return <div className="min-h-screen bg-background pb-24">
      {/* Header with safe-area padding for Android 12+ */}
      <div style={{
        backgroundColor: 'hsl(var(--primary))',
        paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))',
        boxSizing: 'border-box' as const
      }} className="text-white py-4 px-4">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-medium">Dhaq dhaqaaqaaga</h1>
        </div>
      </div>

      {/* History List */}
      <div className="p-4 space-y-3">
        {loading ? <div className="text-center py-8">
            <p className="text-muted-foreground">Loading...</p>
          </div> : orderHistory.length === 0 ? <div className="text-center py-8 space-y-3">
            <p className="text-muted-foreground">Wali dalabo ma samayn lambarkaan</p>
            <p className="text-xs text-muted-foreground">
              Lambarka: {localStorage.getItem('verifiedPhone')}
            </p>
            <Button onClick={() => navigate('/providers')} className="bg-primary text-white">
              Bilow Iibsashada
            </Button>
          </div> : orderHistory.map((item: any) => <div key={item.id} className="bg-card rounded-xl p-3 border shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedOrder(item)}>
              <div className="flex items-start justify-between gap-4">
                {/* Left side - Logo and Details */}
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-full border-2 border-green-500 flex items-center justify-center p-2 flex-shrink-0">
                    <CachedImage src={item.logo} alt={item.provider} bundledName={item.provider} kind="provider" className="w-full h-full object-contain" loading="eager" decoding="sync" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="font-semibold text-foreground text-base">
                      {item.package}
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{item.provider}</span>
                      {item.payment_source && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        item.payment_source === 'ussd_online' ? 'bg-blue-100 text-blue-700' :
                        item.payment_source === 'sms_offline' ? 'bg-orange-100 text-orange-700' :
                        item.payment_source === 'auto_topup' ? 'bg-cyan-100 text-cyan-700' :
                        item.payment_source === 'manual' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{
                        item.payment_source === 'ussd_online' ? 'Online' :
                        item.payment_source === 'sms_offline' ? 'Offline' :
                        item.payment_source === 'auto_topup' ? 'Auto Top-Up' :
                        item.payment_source === 'manual' ? 'Manual' :
                        item.payment_source
                      }</span>}
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
                          <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                          <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                          <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                        </svg>
                        {item.date}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Right side - Price and Status */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="text-lg font-bold text-primary">
                    {item.price}
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    item.delivery_status === 'delivered' ? 'bg-green-100 text-green-700' : 
                    PENDING_STATES.includes(item.delivery_status) ? 'bg-yellow-100 text-yellow-700' : 
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.delivery_status === 'delivered' ? 'Delivered' : 
                     PENDING_STATES.includes(item.delivery_status) ? 'Pending' : 'Failed'}
                  </div>
                </div>
              </div>
            </div>)}
      </div>

      {/* Invoice Modal */}
      {selectedOrder && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md relative border border-border">
            <button onClick={() => setSelectedOrder(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors">
              ✕
            </button>
            
            {/* Provider Logo */}
            <div className="flex justify-center mb-6">
              <div className="w-24 h-24 rounded-full border-4 border-primary/40 flex items-center justify-center p-4 bg-primary/5">
                <CachedImage src={selectedOrder.logo} alt={selectedOrder.provider} bundledName={selectedOrder.provider} kind="provider" className="w-full h-full object-contain" loading="eager" decoding="sync" />
              </div>
            </div>

            {/* Invoice Details */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Xirmada:</span>
                <span className="font-medium text-foreground">{selectedOrder.package}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lambarka aad Lacagta Ka dirtay:</span>
                <span className="font-medium text-foreground">{selectedOrder.senderPhone}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Habka Lacag Bixinta:</span>
                <span className="font-medium text-foreground">EVC</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lambarka aad xirmada u rabtid:</span>
                <span className="font-medium text-foreground">{selectedOrder.receiverPhone}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lacagta:</span>
                <span className="font-medium text-foreground">{selectedOrder.price}</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Lacagta aad Dirtay:</span>
                <span className="font-medium text-foreground">$0.0</span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Xaalada Lacag bixinta:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  selectedOrder.delivery_status === 'delivered' ? 'bg-accent/20 text-accent-foreground' : 
                  selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'bg-orange/15 text-orange' : 
                  'bg-destructive/15 text-destructive'
                }`}>
                  {selectedOrder.delivery_status === 'delivered' ? 'Delivered' : 
                   selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'Pending' : 'Failed'}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground text-sm">Tariikhda Dalabka:</span>
                <span className="font-medium text-foreground">{selectedOrder.dateTime}</span>
              </div>
              
              {selectedOrder.payment_source && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground text-sm">Nooca Dalabka:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    selectedOrder.payment_source === 'ussd_online' ? 'bg-blue-100 text-blue-700' :
                    selectedOrder.payment_source === 'sms_offline' ? 'bg-orange-100 text-orange-700' :
                    selectedOrder.payment_source === 'auto_topup' ? 'bg-cyan-100 text-cyan-700' :
                    selectedOrder.payment_source === 'manual' ? 'bg-purple-100 text-purple-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {selectedOrder.payment_source === 'ussd_online' ? 'Online' :
                     selectedOrder.payment_source === 'sms_offline' ? 'Offline (SMS)' :
                     selectedOrder.payment_source === 'auto_topup' ? 'Auto Top-Up' :
                     selectedOrder.payment_source === 'manual' ? 'Manual' :
                     selectedOrder.payment_source}
                  </span>
                </div>
              )}
              
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-muted-foreground text-sm">Status:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  selectedOrder.delivery_status === 'delivered' ? 'bg-accent/20 text-accent-foreground' : 
                  selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'bg-orange/15 text-orange' : 
                  'bg-destructive/15 text-destructive'
                }`}>
                  {selectedOrder.delivery_status === 'delivered' ? 'Delivered' : 
                   selectedOrder.delivery_status === 'pending' || selectedOrder.delivery_status === 'processing' ? 'Pending' : 'Failed'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <Button 
                onClick={async () => {
                  try {
                    toast({
                      title: 'Preparing...',
                      description: 'Creating invoice image',
                    });

                    const imageBlob = await getInvoiceBlob(selectedOrder);
                    const url = URL.createObjectURL(imageBlob);
                    
                    // Check if on mobile and WhatsApp is available
                    if (navigator.share) {
                      const file = new File([imageBlob], `invoice-${selectedOrder.transactionId}.jpg`, { type: 'image/jpeg' });
                      await navigator.share({
                        title: 'Invoice - ' + selectedOrder.package,
                        text: `Invoice for ${selectedOrder.package} - ${selectedOrder.price}`,
                        files: [file]
                      });
                    } else {
                      // Fallback: Create WhatsApp URL with text
                      const whatsappText = `Invoice - ${selectedOrder.package}%0A%0ATransaction ID: ${selectedOrder.transactionId}%0AProvider: ${selectedOrder.provider}%0AAmount: ${selectedOrder.price}%0APhone: ${selectedOrder.receiverPhone}%0ADate: ${selectedOrder.dateTime}`;
                      window.open(`https://wa.me/?text=${whatsappText}`, '_blank');
                      
                      toast({
                        title: 'Note',
                        description: 'Image sharing not supported on this device. Text sent instead.',
                      });
                    }
                    
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    console.error('Error sharing:', error);
                    toast({
                      title: 'Error',
                      description: 'Failed to share invoice',
                      variant: 'destructive',
                    });
                  }
                }}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
              >
                Share WhatsApp
              </Button>
              
              <Button 
                onClick={async () => {
                  try {
                    toast({
                      title: 'Waa la sameynayaa...',
                      description: 'Sawirka invoice-ka ayaa la keydinayaa',
                    });

                    const imageBlob = await getInvoiceBlob(selectedOrder);
                    const fileName = `invoice-${selectedOrder.transactionId}.jpg`;

                    const isNativeApp = Capacitor.isNativePlatform();
                    if (isNativeApp) {
                      const androidVersionMatch = navigator.userAgent.match(/Android\s(\d+)/i);
                      const androidVersion = androidVersionMatch ? parseInt(androidVersionMatch[1], 10) : 0;

                      await Filesystem.requestPermissions().catch(() => null);

                      const base64String = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const result = reader.result as string;
                          if (!result || !result.includes(',')) {
                            reject(new Error('Failed to convert image to base64'));
                            return;
                          }
                          resolve(result.split(',')[1]);
                        };
                        reader.onerror = () => reject(new Error('Failed to read image blob'));
                        reader.readAsDataURL(imageBlob);
                      });

                      const useLegacyExternalStorage = androidVersion > 0 && androidVersion <= 9;

                      if (useLegacyExternalStorage) {
                        await Filesystem.writeFile({
                          path: `Pictures/NajaxInvoices/${fileName}`,
                          data: base64String,
                          directory: Directory.ExternalStorage,
                          recursive: true,
                        });
                        toast({
                          title: 'Waa la keydiyay! ✅',
                          description: 'Gallery > Pictures > NajaxInvoices',
                        });
                      } else {
                        await Filesystem.mkdir({
                          path: 'NajaxInvoices',
                          directory: Directory.Documents,
                          recursive: true,
                        }).catch(() => null);

                        await Filesystem.writeFile({
                          path: `NajaxInvoices/${fileName}`,
                          data: base64String,
                          directory: Directory.Documents,
                          recursive: true,
                        });

                        toast({
                          title: 'Waa la keydiyay! ✅',
                          description: `Documents/NajaxInvoices/${fileName}`,
                        });
                      }
                    } else {
                      // Website browser - use native download
                      await downloadBlobInBrowser(imageBlob, fileName);

                      toast({
                        title: 'Waa la keydiyay! ✅',
                        description: 'Invoice-ka waa lagu keydiyay Downloads folder-ka',
                      });
                    }

                  } catch (error) {
                    console.error('Error:', error);
                    toast({
                      title: 'Khalad!',
                      description: 'Sawirka lama keydin karin. Fadlan isku day mar kale.',
                      variant: 'destructive',
                    });
                  }
                }}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                Save Invoice
              </Button>
            </div>
          </div>
        </div>}

      {/* Bottom Navigation */}
    </div>;
};
export default OrderHistory;