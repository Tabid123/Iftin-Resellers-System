import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from "@/lib/router-compat";
import { ArrowLeft, Check, Zap, Clock, Smartphone, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { PaymentErrorModal } from '@/components/PaymentErrorModal';
import { PaymentLoadingOverlay } from '@/components/PaymentLoadingOverlay';
import OfflinePhoneInputSheet from '@/components/OfflinePhoneInputSheet';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { workspaceQueryKey, workspaceStorage } from '@/lib/workspaceKeys';
import { useTenant } from '@/contexts/TenantContext';
import { useQuery } from '@tanstack/react-query';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { buildPaymentUssd, fetchIftinCatalog, hasCatalog, isApiPartnerTenant, isOrderingBlocked, mapPaymentProviders } from '@/lib/iftinCatalog';
import {
  createIftinIntent,
  fetchIftinIntentStatus,
  isIntentPending,
  IftinIntentError,
  type IftinIntent,
} from '@/lib/iftinIntent';
import { Capacitor } from '@capacitor/core';
import { getAllowedPrefixes, matchesAllowedPrefix, formatPrefixes } from '@/lib/phonePrefixes';
import CachedImage from '@/components/CachedImage';
import DiscoverySearchOverlay from '@/components/ussd/DiscoverySearchOverlay';
import { localizeImage } from '@/lib/localImages';
import { purchaseWithWaafiPay, WaafiPayPurchaseError } from '@/lib/waafiPay';

interface PaymentProvider {
  id: string;
  provider_name: string;
  provider_logo: string | null;
  commission_rate: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  prefix_code: string | null;
  ussd_code_template: string | null;
  payment_number: string | null;
  is_waafipay?: boolean | null;
}


function waafiAttemptStorageKey(workspaceId: string) {
  return `waafipay:attempt:${workspaceId}`;
}

function getWaafiClientReference(workspaceId: string, signature: string) {
  const key = waafiAttemptStorageKey(workspaceId);
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (stored?.signature === signature && typeof stored?.clientReference === 'string') {
      return stored.clientReference as string;
    }
  } catch {
    // Invalid/stale storage is replaced below.
  }
  const clientReference = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, JSON.stringify({ signature, clientReference }));
  return clientReference;
}

function clearWaafiClientReference(workspaceId: string) {
  try {
    sessionStorage.removeItem(waafiAttemptStorageKey(workspaceId));
  } catch {
    // Storage can be unavailable in restricted webviews.
  }
}

const PaymentProviders = () => {
  const localizePayments = (items: PaymentProvider[]) => items.map((payment) => ({
    ...payment,
    provider_logo: localizeImage('payment', payment.provider_logo, payment.provider_name),
  }));
  const navigate = useNavigate();
  const { isReallyOnline } = useConnectivity();
  const { queueOrder } = useOfflineSync();
  const paymentTenantState = useTenant();
  const workspaceId = (paymentTenantState as any).tenant?.id ?? null;
  const { provider } = useParams<{ provider: string }>();
  const location = useLocation();
  const basePackage = location.state?.package;
  const providerName = location.state?.providerName;
  const categoryName = location.state?.categoryName || '';
  const discoveryRootId = location.state?.discoveryRootId || '';
  const discoveryPending = !!location.state?.discoveryPending;
  const [liveDiscovery, setLiveDiscovery] = useState<any | null>(null);
  const [showDiscoverySearch, setShowDiscoverySearch] = useState(false);
  const discoveryId = liveDiscovery?.id || location.state?.discoveryId || '';
  const discoveryLabel = liveDiscovery?.label || location.state?.discoveryLabel || '';
  const discoveryReceiverPhone = location.state?.discoveryReceiverPhone || '';
  const discoveryIndex = liveDiscovery?.index || location.state?.discoveryIndex || '';
  const lockedReceiver = !!location.state?.discoveryId;
  const packageData = useMemo(() => {
    if (!liveDiscovery) return basePackage;
    return {
      ...basePackage,
      name: liveDiscovery.name,
      price: `$${Number(liveDiscovery.price).toFixed(2)}`,
      data: liveDiscovery.data || liveDiscovery.name,
      validity: liveDiscovery.validity || '',
    };
  }, [basePackage, liveDiscovery]);
  const prefillPaymentProviderId = location.state?.prefillPaymentProviderId || '';
  const prefillSenderPhone = location.state?.prefillSenderPhone || '';

  const isADSLPackage = (catName: string) => catName?.toUpperCase().includes('ADSL');
  const isADSL = isADSLPackage(categoryName);

  const { data: paymentProviders = [], isLoading } = useQuery({
    enabled: Boolean(workspaceId),
    queryKey: workspaceQueryKey(workspaceId, 'paymentProviders'),
    queryFn: async () => {
      if (!isReallyOnline) {
        const cached = workspaceStorage.get('offline_payment_providers', workspaceId);
        return cached ? localizePayments(JSON.parse(cached)) : [];
      }

      const readCache = () => {
        try {
          const cached = workspaceStorage.get('offline_payment_providers', workspaceId);
          const parsed = cached ? JSON.parse(cached) : [];
          return Array.isArray(parsed) ? localizePayments(parsed) : [];
        } catch {
          return [];
        }
      };

      // Lambarka lacagta ee tenant-ku gudaha ka galiyo (Payment Settings) waa
      // kan ugu mudnaanta sarreeya — katalooggu wuxuu keliya buuxiyaa waxa maqan.
      const fetchLocal = async () => {
        try {
          const { data, error } = await (supabase as any).rpc('get_active_payment_providers');
          if (error || !Array.isArray(data)) return [] as any[];
          return localizePayments(data as any);
        } catch {
          return [] as any[];
        }
      };

      const nameKey = (n: any) => String(n ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const partner = workspaceId ? await isApiPartnerTenant(workspaceId) : false;

      // Android/local tenants use exactly one fast source. They must never pay
      // the cost of loading the Iftin API catalog just to render checkout.
      if (!partner) {
        const local = await fetchLocal();
        if (local.length) {
          workspaceStorage.set('offline_payment_providers', JSON.stringify(local), workspaceId);
          return local;
        }
        return readCache();
      }

      // API-partner tenants still merge reseller-specific payment overrides
      // over the shared Iftin catalog.
      const [local, catalog] = await Promise.all([fetchLocal(), fetchIftinCatalog()]);
      const fromIftin = hasCatalog(catalog) ? mapPaymentProviders(catalog!) : [];

      let merged: any[] = [];
      if (fromIftin.length) {
        const localByName = new Map(local.map((p: any) => [nameKey(p.provider_name), p]));
        merged = fromIftin.map((p: any) => {
          const own = localByName.get(nameKey(p.provider_name));
          if (!own) return p;
          localByName.delete(nameKey(p.provider_name));
          return {
            ...p,
            payment_number: own.payment_number || p.payment_number,
            prefix_code: own.prefix_code || p.prefix_code,
            ussd_code_template: own.ussd_code_template || p.ussd_code_template,
            is_waafipay: own.is_waafipay ?? p.is_waafipay,
          };
        });
        merged = [...merged, ...Array.from(localByName.values())];
      } else {
        merged = local;
      }

      if (merged.length) {
        workspaceStorage.set('offline_payment_providers', JSON.stringify(merged), workspaceId);
        return merged;
      }
      return readCache();
    },
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    initialData: () => {
      try {
        const cached = workspaceStorage.get('offline_payment_providers', workspaceId);
        return cached ? localizePayments(JSON.parse(cached)) : undefined;
      } catch {
        return undefined;
      }
    },
  });

  const orderedPaymentProviders = useMemo(() => {
    const rank = (name: string) => {
      const n = (name || '').toLowerCase().replace(/[^a-z]/g, '');
      if (n.includes('evc')) return 0;
      if (n.includes('jeeb') || n.includes('jeep')) return 1;
      if (n.includes('edahab') || n.includes('dahab')) return 2;
      return 3;
    };
    return [...paymentProviders].sort((a: any, b: any) => rank(a?.provider_name) - rank(b?.provider_name));
  }, [paymentProviders]);

  const { data: deliveryInstructions = [] } = useQuery({
    queryKey: workspaceQueryKey(workspaceId, 'deliveryInstructions', packageData?.categoryId, packageData?.providerId),
    queryFn: async () => {
      if (!packageData?.categoryId && !packageData?.providerId) return [];
      if (!isReallyOnline) {
        const cached = workspaceStorage.get('offline_delivery_instructions', workspaceId);
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
        return [];
      }
      const { data: all, error } = await (supabase as any).rpc('get_tenant_delivery_instructions');
      if (error) throw error;
      return (all || []).filter((inst: any) => inst.provider_id === packageData.providerId);
    },
    enabled: !!(packageData?.categoryId || packageData?.providerId),
    staleTime: 5 * 60 * 1000,
    retry: false,
    initialData: () => {
      try {
        if (!packageData?.providerId) return [];
        const cached = workspaceStorage.get('offline_delivery_instructions', workspaceId);
        if (cached) {
          const allInstructions = JSON.parse(cached);
          return allInstructions.filter((inst: any) => inst.provider_id === packageData.providerId);
        }
      } catch {}
      return [];
    },
  });

  const [selectedProvider, setSelectedProvider] = useState('');
  const selectedPaymentProviderForUi = paymentProviders.find(p => p.id === selectedProvider);
  const isWaafiProvider = (p: any) =>
    p?.is_waafipay === true || /waafipay/i.test(p?.provider_name || '');
  const isWaafiPaySelected = isWaafiProvider(selectedPaymentProviderForUi);
  const [paymentNumber, setPaymentNumber] = useState('');
  const [receiverNumber, setReceiverNumber] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConfirmationScreen, setShowConfirmationScreen] = useState(false);
  const [paymentProviderPrefix, setPaymentProviderPrefix] = useState('');
  const [receiverProviderPrefix, setReceiverProviderPrefix] = useState('');
  const [receiverNumberError, setReceiverNumberError] = useState('');
  const [paymentNumberError, setPaymentNumberError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorType, setErrorType] = useState<'insufficient_balance' | 'user_cancelled' | 'timeout' | 'wrong_pin' | 'general'>('general');
  const [errorMessage, setErrorMessage] = useState('');
  const [showOfflineSheet, setShowOfflineSheet] = useState(false);
  const isOfflineFromState = location.state?.isOffline;
  const [ussdCodeForDisplay, setUssdCodeForDisplay] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [intent, setIntent] = useState<IftinIntent | null>(null);
  const [intentState, setIntentState] = useState<string>('pending');
  const [intentNotes, setIntentNotes] = useState<string | null>(null);
  const [intentSellPrice, setIntentSellPrice] = useState<number>(0);
  const [intentUssd, setIntentUssd] = useState<string | null>(null);

  const getProviderFromPrefix = useCallback((phoneNumber: string) => {
    const prefix = phoneNumber.substring(0, 2);
    const firstChar = phoneNumber.substring(0, 1);
    if (firstChar === '1' && phoneNumber.length === 7) return { name: 'Hormuud', logo: hormuudLogo };
    switch (prefix) {
      case '61':
      case '77': return { name: 'Hormuud', logo: hormuudLogo };
      case '62': return { name: 'Somtel', logo: somtelLogo };
      case '68': return { name: 'Somnet', logo: somnetLogo };
      case '63':
      case '65': return { name: 'Somlink', logo: somlinkLogo };
      case '71': return { name: 'Amtel', logo: amtelLogo };
      default: return { name: 'Provider', logo: '' };
    }
  }, []);

  const getProviderPrefix = useCallback((name: string) => getAllowedPrefixes(name)[0] ?? '', []);
  const getBrandBackgroundClass = useCallback((name: string) => {
    switch (name?.toLowerCase() || '') {
      case 'hormuud': return 'bg-hormuud';
      case 'somtel': return 'bg-somtel';
      case 'somlink': return 'bg-somlink';
      case 'somnet': return 'bg-somnet';
      case 'amtel': return 'bg-amtel';
      default: return 'bg-primary';
    }
  }, []);

  React.useEffect(() => {
    if (lockedReceiver && discoveryReceiverPhone) {
      const clean = String(discoveryReceiverPhone).replace(/\D/g, '').replace(/^252/, '').replace(/^0/, '').slice(-9);
      setReceiverProviderPrefix(clean.slice(0, 2));
      setReceiverNumber(clean);
      setReceiverNumberError('');
      return;
    }
    if (!providerName) return;
    if (isADSL) {
      setReceiverProviderPrefix('1');
      setReceiverNumber('1');
    } else {
      const prefix = getProviderPrefix(providerName);
      setReceiverProviderPrefix(prefix);
      setReceiverNumber(prefix);
    }
  }, [providerName, isADSL, getProviderPrefix, lockedReceiver, discoveryReceiverPhone]);

  const offlineSenderRef = React.useRef(false);

  const handlePaymentSelect = useCallback((paymentId: string) => {
    setSelectedProvider(paymentId);
    const selectedPayment = paymentProviders.find(p => p.id === paymentId);
    if (selectedPayment) {
      const prefix = isWaafiProvider(selectedPayment)
        ? ''
        : getAllowedPrefixes(selectedPayment.provider_name)[0] ?? '';
      setPaymentProviderPrefix(prefix);
      if (!offlineSenderRef.current) setPaymentNumber(prefix);
    }
  }, [paymentProviders]);

  const handlePaymentNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length > 9) return;
    setPaymentNumber(value);
    const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
    const paymentProviderName = selectedPayment?.provider_name ?? '';
    const allowed = isWaafiProvider(selectedPayment) ? [] : getAllowedPrefixes(paymentProviderName);
    if (value.length >= 2 && !matchesAllowedPrefix(value, allowed)) {
      setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${formatPrefixes(allowed)})`);
    } else setPaymentNumberError('');
  }, [paymentProviders, selectedProvider]);

  const handleReceiverNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (lockedReceiver) return;
    const value = e.target.value.replace(/\D/g, '');
    if (isADSL) {
      if (value.length <= 7) {
        setReceiverNumber(value);
        setReceiverNumberError(value.length >= 1 && !value.startsWith('1') ? 'ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1' : '');
      }
      return;
    }
    if (value.length <= 9) {
      setReceiverNumber(value);
      const allowed = getAllowedPrefixes(providerName);
      setReceiverNumberError(value.length >= 2 && !matchesAllowedPrefix(value, allowed)
        ? `Fadlan gali lambarka shirkada ${providerName} (${formatPrefixes(allowed)})`
        : '');
    }
  }, [providerName, isADSL, lockedReceiver]);

  const handleProceedToPayment = useCallback(() => {
    if (selectedProvider) setShowPaymentModal(true);
  }, [selectedProvider]);

  // Maamuus (*212*): habka lacag bixinta iyo lambarka diraha horeba waa la doortay.
  const prefillDone = React.useRef(false);
  React.useEffect(() => {
    if (prefillDone.current || !prefillPaymentProviderId || paymentProviders.length === 0) return;
    prefillDone.current = true;
    handlePaymentSelect(prefillPaymentProviderId);
    if (prefillSenderPhone) {
      offlineSenderRef.current = true;
      setPaymentNumber(String(prefillSenderPhone).replace(/\D/g, '').slice(-9));
    }
    setShowPaymentModal(true);
  }, [prefillPaymentProviderId, prefillSenderPhone, paymentProviders, handlePaymentSelect]);

  const handleShowConfirmation = () => {
    if (!paymentNumber || !receiverNumber) return;
    if (paymentNumber.length !== 9) {
      setPaymentNumberError('Fadlan gali lambarka oo dhan (9 digits)');
      return;
    }
    if (isADSL) {
      if (receiverNumber.length !== 7) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay 7 lambar');
        return;
      }
      if (!receiverNumber.startsWith('1')) {
        setReceiverNumberError('ADSL-ka wuxuu u baahan yahay lambar bilaabanaya 1');
        return;
      }
    } else {
      if (receiverNumber.length !== 9) {
        setReceiverNumberError('Fadlan gali lambarka oo dhan (9 digits)');
        return;
      }
      const allowedReceiver = getAllowedPrefixes(providerName);
      if (!matchesAllowedPrefix(receiverNumber, allowedReceiver)) {
        setReceiverNumberError(`Fadlan gali lambarka shirkada ${providerName} (${formatPrefixes(allowedReceiver)})`);
        return;
      }
    }

    const selectedPayment = paymentProviders.find(p => p.id === selectedProvider);
    const paymentProviderName = selectedPayment?.provider_name ?? '';
    const allowedPayment = isWaafiProvider(selectedPayment) ? [] : getAllowedPrefixes(paymentProviderName);
    if (!matchesAllowedPrefix(paymentNumber, allowedPayment)) {
      setPaymentNumberError(`Fadlan gali lambarka ${paymentProviderName} (${formatPrefixes(allowedPayment)})`);
      return;
    }

    // *212* Maamuus: marka lambarada la galiyo, isla markiiba baaritaanka
    // xirmooyinka lambarkaas ayaa bilaabmaya — ka hor inta aan lacag la bixin.
    if (discoveryPending && !liveDiscovery) {
      setShowPaymentModal(false);
      setShowDiscoverySearch(true);
      return;
    }

    const displayPayment = selectedPayment ?? paymentProviders[0];
    const displayAmount = packageData?.price?.replace('$', '') || '0';
    setUssdCodeForDisplay(buildPaymentUssd(displayPayment ?? {}, displayAmount) ?? '');
    setShowPaymentModal(false);
    setShowConfirmationScreen(true);
  };

  const handlePaymentComplete = async () => {
    if (isOrderingBlocked()) {
      toast({
        title: 'Dalab lama sameyn karo',
        description: 'Xadka deynta (credit limit) waa la gaaray. Fadlan bixi fatuuradda.',
        variant: 'destructive',
      });
      return;
    }

    const selectedPaymentProvider = paymentProviders.find(p => p.id === selectedProvider);
    const amount = packageData?.price?.replace('$', '') || '0';
    setIsProcessingPayment(true);

    if (!isReallyOnline || isOfflineFromState) {
      try {
        const selectedPayment = selectedPaymentProvider ?? paymentProviders[0];
        const companyPaymentNum = selectedPayment?.payment_number || paymentProviders[0]?.payment_number || '';
        const ussdCode = buildPaymentUssd(selectedPayment ?? {}, amount) ?? '';
        const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
        const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
        const userSenderPhone = paymentNumber;

        queueOrder({
          customer_phone: customerPhone || userSenderPhone,
          sender_phone: userSenderPhone,
          receiver_phone: receiverNumber,
          package_id: packageData?.id || '',
          provider_id: packageData?.providerId || '',
          payment_provider_id: selectedProvider,
          package_name: packageData?.name || 'Data Package',
          data_amount: packageData?.data || '',
          selling_price: parseFloat(amount),
          cost_price: Number(packageData?.costPrice ?? 0),
          payment_number: companyPaymentNum,
          status: 'pending_payment',
          delivery_status: 'pending'
        } as any);

        setShowConfirmationScreen(false);
        navigate('/');
        window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
        return;
      } catch (error: any) {
        console.error('Offline payment error:', error);
        setErrorType('general');
        setErrorMessage('Khalad ayaa dhacay. Fadlan isku day mar kale.');
        setShowErrorModal(true);
        setIsProcessingPayment(false);
        return;
      }
    }

    try {
      const verifiedPhone = localStorage.getItem('verifiedPhone') || '';
      const customerPhone = verifiedPhone.startsWith('+252') ? verifiedPhone.substring(4) : verifiedPhone;
      const cleanCustomerPaymentPhone = paymentNumber.startsWith('+252')
        ? paymentNumber.substring(4)
        : paymentNumber.startsWith('0') ? paymentNumber.substring(1) : paymentNumber;

      // Only API-partner tenants may use Iftin prepaid intents.
      // Android-device tenants (e.g. Marwaan) own their local package IDs and must
      // continue through the local pending-payment + delivery queue path. Sending a
      // local package UUID to Iftin Partner API returns package_not_found.
      const useIftinIntent = workspaceId ? await isApiPartnerTenant(workspaceId) : false;

      // WaafiPay = API payment. Skip the Iftin intent/USSD dial path entirely,
      // otherwise the dialer opens and the WaafiPay branch below never runs.
      if (!discoveryId && !isWaafiPaySelected && useIftinIntent) {
        try {
        const created = await createIftinIntent({
          receiver_phone: receiverNumber,
          sender_phone: cleanCustomerPaymentPhone,
          package_id: String(packageData?.id ?? ''),
          payment_provider: String(selectedPaymentProvider?.provider_name ?? '').toLowerCase(),
          package_name: packageData?.name ?? 'Data Package',
          data_amount: packageData?.data ?? null,
          provider_id: packageData?.providerId ?? null,
          customer_phone: customerPhone || cleanCustomerPaymentPhone,
        });

        const sellPrice = parseFloat(amount) || created.amount;
        // Do not mutate an arbitrary segment of Iftin's USSD string. Rebuild it
        // through the same shared normalizer used by standalone/offline tenants.
        const intentPaymentProvider = {
          ...(selectedPaymentProvider ?? paymentProviders[0] ?? {}),
          payment_number: created.payment_number || selectedPaymentProvider?.payment_number || paymentProviders[0]?.payment_number || null,
        };
        const sellUssd = buildPaymentUssd(intentPaymentProvider, sellPrice) ?? created.ussd_code;

        setIntent(created);
        setIntentSellPrice(sellPrice);
        setIntentUssd(sellUssd);
        setIntentState('pending');
        setIntentNotes(null);
        setShowConfirmationScreen(false);
        setIsProcessingPayment(false);

        if (sellUssd) window.location.href = `tel:${encodeURIComponent(sellUssd)}`;
        return;
      } catch (intentError: any) {
        const code = intentError instanceof IftinIntentError ? intentError.code : '';
        const iftinNotConfigured = code === 'missing_api_key' || code === 'invalid_tenant';
        if (!iftinNotConfigured) {
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage(intentError?.message || 'Iftin API-ga wuu diiday dalabka.');
          setShowErrorModal(true);
          return;
        }
      }
      }

      if (!discoveryId && workspaceId && isWaafiPaySelected) {
        const waafiSignature = [
          workspaceId,
          String(packageData?.id || ''),
          cleanCustomerPaymentPhone,
          receiverNumber,
          String(selectedProvider || ''),
          amount,
        ].join(':');
        const clientReference = getWaafiClientReference(workspaceId, waafiSignature);

        try {
          const waafiResult = await purchaseWithWaafiPay({
            tenant_id: workspaceId,
            client_reference: clientReference,
            payer_phone: cleanCustomerPaymentPhone,
            receiver_phone: receiverNumber,
            package_id: String(packageData?.id || ''),
            payment_provider_id: selectedProvider || null,
          });

          clearWaafiClientReference(workspaceId);
          setShowConfirmationScreen(false);
          setIsProcessingPayment(false);

          if (!waafiResult.delivery_queued) {
            toast({
              title: 'Lacagta waa la xaqiijiyey',
              description: waafiResult.message || 'Delivery-ga admin-ka ayaa dib u hubinaya.',
            });
          }

          navigate('/payment-success', {
            state: {
              package: packageData,
              paymentMethod: 'WaafiPay',
              receiverNumber,
              paymentNumber: cleanCustomerPaymentPhone,
              orderId: waafiResult.order_id,
              referenceId: waafiResult.reference_id,
            },
          });
          return;
        } catch (waafiError: any) {
          const typed = waafiError instanceof WaafiPayPurchaseError ? waafiError : null;
          if (typed?.allowLegacyFallback) {
            clearWaafiClientReference(workspaceId);
          } else {
            if (typed?.canStartNewAttempt) clearWaafiClientReference(workspaceId);
            setIsProcessingPayment(false);
            setShowConfirmationScreen(false);
            setErrorType(
              typed?.code === 'insufficient_balance'
                ? 'insufficient_balance'
                : typed?.code === 'payment_cancelled' || typed?.code === 'payment_declined'
                  ? 'user_cancelled'
                  : typed?.code === 'payment_timeout'
                    ? 'timeout'
                    : 'general',
            );
            setErrorMessage(
              typed?.message ||
              'Xaaladda WaafiPay lama xaqiijin. Fadlan ha ku celin payment-ka isla markiiba.',
            );
            setShowErrorModal(true);
            return;
          }
        }
      }

      const pendingPaymentData = {
        verified_phone: customerPhone,
        sender_phone: cleanCustomerPaymentPhone,
        receiver_phone: receiverNumber,
        provider_id: packageData?.providerId,
        package_id: packageData?.id,
        payment_provider: selectedPaymentProvider?.provider_name || '',
        expected_amount: parseFloat(amount),
        discovery_id: discoveryId || null,
        discovery_label: discoveryLabel || null,
        discovery_index: discoveryIndex || null,
        status: 'pending'
      };

      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      let existingPendingQuery: any = supabase
        .from('pending_online_payments')
        .select('id')
        .eq('sender_phone', cleanCustomerPaymentPhone)
        .eq('receiver_phone', receiverNumber)
        .eq('package_id', packageData?.id)
        .eq('expected_amount', parseFloat(amount))
        .eq('status', 'pending')
        .gte('created_at', tenMinutesAgo);
      if (discoveryId) existingPendingQuery = existingPendingQuery.eq('discovery_id', discoveryId);
      const { data: existingPending } = await existingPendingQuery.limit(1);

      if (!(existingPending && existingPending.length > 0)) {
        let insertSuccess = false;
        let lastError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const { error: pendingError } = await supabase.from('pending_online_payments').insert([pendingPaymentData]);
            if (pendingError) {
              lastError = pendingError;
              if (attempt < 3) await new Promise(r => setTimeout(r, 500));
            } else {
              insertSuccess = true;
              break;
            }
          } catch (dbError: any) {
            lastError = dbError;
            if (attempt < 3) await new Promise(r => setTimeout(r, 500));
          }
        }
        if (!insertSuccess) {
          setIsProcessingPayment(false);
          setShowConfirmationScreen(false);
          setErrorType('general');
          setErrorMessage(lastError?.message ? `Cilad farsamo: ${lastError.message}` : 'Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.');
          setShowErrorModal(true);
          return;
        }
      }

      const ussdCode = buildPaymentUssd(selectedPaymentProvider ?? paymentProviders[0] ?? {}, amount) ?? '';
      setShowConfirmationScreen(false);
      setIsProcessingPayment(false);
      window.location.href = `tel:${encodeURIComponent(ussdCode)}`;

      if (Capacitor.isNativePlatform()) navigate('/');
      else setTimeout(() => navigate('/'), 1200);
    } catch (error: any) {
      console.error('Payment error:', error);
      setIsProcessingPayment(false);
      setShowErrorModal(false);
      setShowConfirmationScreen(false);
      setTimeout(() => {
        setErrorType('general');
        setErrorMessage(error.message || 'Cilad farsamo ayaa dhacday. Fadlan isku day mar kale ama la xiriir adeegga macaamiisha.');
        setShowErrorModal(true);
      }, 100);
    }
  };

  useEffect(() => {
    if (!intent?.external_ref || !isIntentPending(intentState)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchIftinIntentStatus(intent.external_ref);
        if (cancelled) return;
        if (!isIntentPending(s.status)) {
          setIntent(null);
          return;
        }
        setIntentState(s.status);
        setIntentNotes(s.notes ?? null);
      } catch (e: any) {
        if (!cancelled) setIntentNotes(e?.message ?? null);
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [intent?.external_ref, intentState]);

  return <div className="min-h-screen bg-[#efefef] pb-24">
    <div className={`${getBrandBackgroundClass(providerName || '')} text-white py-4 px-4`} style={{ paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))', boxSizing: 'border-box' as const }}>
      <div className="flex items-center">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white hover:bg-white/20 mr-4"><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-medium">Dooro habka lacag bixinta</h1>
      </div>
    </div>

    <div className="p-4 space-y-3 mt-4">
      {isReallyOnline !== true && <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg p-3 mb-4"><p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">📵 Offline Mode: USSD kaliya ayaa la isticmaali karaa</p></div>}
      {orderedPaymentProviders.map(payment => <div key={payment.id} onClick={() => handlePaymentSelect(payment.id)} className={`bg-white rounded-2xl p-4 flex items-center justify-between cursor-pointer border-2 transition-all shadow-lg hover:shadow-xl ${selectedProvider === payment.id ? 'border-primary shadow-xl scale-105' : 'border-transparent'}`} style={{ boxShadow: selectedProvider === payment.id ? '0 10px 25px rgba(0, 153, 255, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.1)' }}>
        <div className="flex items-center"><div className="w-16 h-12 mr-4 flex items-center justify-center bg-gray-50 rounded-lg"><CachedImage src={payment.provider_logo} alt={payment.provider_name} bundledName={payment.provider_name} kind="payment" className="w-full h-full object-contain" loading="eager" decoding="sync" /></div><div><h3 className="font-semibold text-gray-800">{payment.provider_name}</h3>{isReallyOnline !== true && payment.ussd_code_template && <p className="text-xs text-muted-foreground">USSD Code</p>}</div></div>
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${selectedProvider === payment.id ? 'bg-primary border-primary scale-110' : 'border-muted-foreground'}`}>{selectedProvider === payment.id && <Check className="w-5 h-5 text-primary-foreground" />}</div>
      </div>)}
    </div>

    {showPaymentModal && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4">
      <h3 className="text-lg font-medium mb-4 text-center">{paymentProviders.find(p => p.id === selectedProvider)?.provider_name || 'Faahfaahinta lacag bixinta'}</h3>
      <div className="space-y-2"><Label htmlFor="payment-number" className="text-sm font-medium text-foreground">Gali Lambarka aad lacagta ka direyso</Label><div className="flex items-center gap-2"><div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted"><img src={somaliaFlag} alt="Somalia" className="w-6 h-4" width={24} height={16} /><span className="text-sm">+252</span></div><Input id="payment-number" type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="tel-national" enterKeyHint="next" placeholder={paymentProviderPrefix ? `${paymentProviderPrefix}XXXXXXX` : 'XXXXXXXXX'} value={paymentNumber} onChange={handlePaymentNumberChange} maxLength={9} className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${paymentNumberError ? 'border-red-500' : ''}`} /></div>{paymentNumberError && <p className="text-sm text-red-500 font-medium">{paymentNumberError}</p>}</div>
      <div className="space-y-2"><Label htmlFor="receiver-number" className="text-sm font-medium text-foreground">{isADSL ? 'Gali Lambarka ADSL-ka (7 lambar bilaabanaya 1)' : 'Gali Lambarka xirmada lagu shubaayo'}</Label><div className="flex items-center gap-2"><div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted"><img src={somaliaFlag} alt="Somalia" className="w-6 h-4" width={24} height={16} /><span className="text-sm">+252</span></div><Input id="receiver-number" type="tel" inputMode="numeric" pattern="[0-9]*" autoComplete="tel-national" enterKeyHint="done" placeholder={isADSL ? '1XXXXXX' : (receiverProviderPrefix ? `${receiverProviderPrefix}XXXXXXX` : 'XXXXXXXXX')} value={receiverNumber} onChange={handleReceiverNumberChange} readOnly={lockedReceiver} maxLength={isADSL ? 7 : 9} className={`flex-1 focus:border-[#0099ff] focus:ring-[#0099ff] ${receiverNumberError ? 'border-red-500' : ''}`} /></div>{receiverNumberError && <p className="text-sm text-red-500 font-medium">{receiverNumberError}</p>}{isADSL && <p className="text-xs text-muted-foreground">ADSL: 7 lambar, tusaale: 1234567</p>}</div>
      <div className="flex gap-2 pt-4"><Button variant="outline" onClick={() => setShowPaymentModal(false)} className="flex-1">Cancel</Button><Button onClick={handleShowConfirmation} className="flex-1 bg-primary text-white">Pay Now</Button></div>
    </div></div>}

    {showConfirmationScreen && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white dark:bg-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
      <h2 className="text-xl font-bold text-center text-foreground">XAQIIJIN IIBSI</h2>
      <div className="bg-white dark:bg-card rounded-lg border shadow-sm p-4"><div className="flex justify-between items-start mb-2"><div className="flex-1"><h3 className="text-lg font-semibold text-foreground">{packageData?.name || 'Package'}</h3></div><div className="text-right"><span className={`text-2xl font-bold ${getBrandBackgroundClass(providerName || '').replace('bg-', 'text-')}`}>{packageData?.price}</span></div></div><div className={`h-0.5 mb-3 ${getBrandBackgroundClass(providerName || '')}`} /><div className="space-y-2 mb-4"><div className="flex items-center gap-2"><Zap className="w-4 h-4" /><span className="text-sm text-muted-foreground">{packageData?.data || 'Data'}</span></div><div className="flex items-center gap-2"><Smartphone className="w-4 h-4" /><span className="text-sm text-muted-foreground">Mobile Internet</span></div><div className="flex items-center gap-2"><Clock className="w-4 h-4" /><span className="text-sm text-muted-foreground">{packageData?.validity || 'Validity'}</span></div></div></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground font-medium uppercase">Lambarka lacagta diraayo</p><div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">{getProviderFromPrefix(paymentNumber).logo ? <img src={getProviderFromPrefix(paymentNumber).logo} alt={getProviderFromPrefix(paymentNumber).name} className="w-10 h-10 rounded-full object-contain" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">{getProviderFromPrefix(paymentNumber).name.charAt(0)}</div>}<span className="text-lg font-bold text-foreground">+252-{paymentNumber}</span></div></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground font-medium uppercase">Lambarka xirmada helaayo</p><div className="flex items-center gap-3 bg-muted rounded-lg p-3 border border-border">{getProviderFromPrefix(receiverNumber).logo ? <img src={getProviderFromPrefix(receiverNumber).logo} alt={getProviderFromPrefix(receiverNumber).name} className="w-10 h-10 rounded-full object-contain" /> : <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">{getProviderFromPrefix(receiverNumber).name.charAt(0)}</div>}<span className="text-lg font-bold text-foreground">+252-{receiverNumber}</span></div></div>
      <div className="bg-destructive text-destructive-foreground p-3 rounded-lg text-center"><p className="font-semibold text-sm">Ma hubtaa inaad {packageData?.price} ka dirtid {paymentNumber}?</p></div>
      {isWaafiPaySelected ? null : <div className="flex items-center justify-between bg-muted rounded-lg p-3 border border-border"><code className="text-lg font-bold text-primary select-all">{ussdCodeForDisplay}</code><Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(ussdCodeForDisplay); toast({ title: "La copy-gareeye!", description: "USSD code-ka la copy-gareeye" }); }} className="ml-2"><Copy className="w-4 h-4" /></Button></div>}
      <div className="flex gap-3 pt-2"><Button variant="outline" onClick={() => { setShowConfirmationScreen(false); setShowPaymentModal(true); }} className="flex-1 py-5 text-base font-bold border-2">MAYA</Button><Button onClick={() => { if (!isProcessingPayment) handlePaymentComplete(); }} disabled={isProcessingPayment} className="flex-1 py-5 text-base font-bold bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">HAA IIBSO</Button></div>
    </div></div>}

    <div className="fixed bottom-0 left-0 right-0 px-4 pt-4 pb-8 bg-[#efefef]"><Button onClick={handleProceedToPayment} className="w-full bg-primary text-white font-semibold py-4 rounded-2xl text-lg hover:opacity-90 transition-opacity">{selectedProvider ? (packageData?.price ? `Bixi Hada ${packageData.price}` : 'Sii wad') : 'Dooro habka lacag bixinta'}</Button></div>
    <DiscoverySearchOverlay
      open={showDiscoverySearch}
      rootPackageId={discoveryRootId}
      receiverPhone={receiverNumber}
      onCancel={() => { setShowDiscoverySearch(false); setShowPaymentModal(true); }}
      onSelect={(item, foundDiscoveryId) => {
        setShowDiscoverySearch(false);
        setLiveDiscovery({
          id: foundDiscoveryId,
          label: item.carrier_label || item.label,
          index: item.index,
          price: Number(item.selling_price),
          name: item.label,
          data: item.info_line1 || item.label,
          validity: item.info_line2 || '',
        });
        const selectedPayment = paymentProviders.find(p => p.id === selectedProvider) ?? paymentProviders[0];
        setUssdCodeForDisplay(buildPaymentUssd(selectedPayment ?? {}, Number(item.selling_price).toFixed(2)) ?? '');
        setShowConfirmationScreen(true);
      }}
    />
    <PaymentLoadingOverlay isLoading={isProcessingPayment} />
    <PaymentErrorModal isOpen={showErrorModal} onClose={() => setShowErrorModal(false)} onRetry={() => { setShowErrorModal(false); setShowConfirmationScreen(true); }} errorType={errorType} errorMessage={errorMessage} />
    <OfflinePhoneInputSheet open={showOfflineSheet} onOpenChange={setShowOfflineSheet} />
  </div>;
};

export default PaymentProviders;
