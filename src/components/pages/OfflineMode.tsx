import { useState, useEffect } from 'react';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { useNavigate } from "@/lib/router-compat";
import { ArrowLeft, Phone, CheckCircle2 } from 'lucide-react';
import { Link } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { getTenantId } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { saveOfflineRegistration } from '@/lib/offlineRegistration';
import { useTenant } from '@/contexts/TenantContext';
import somaliaFlag from '@/assets/somalia-flag-hq.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';
import CachedImage from '@/components/CachedImage';
import PhoneNumberInput from '@/components/PhoneNumberInput';
import { playAudioPrompt, primeAudioPrompts } from '@/lib/audioPrompts';


// Full provider map for receiver phone (all providers supported)
const allProviderMap: {
  [key: string]: { id: string; name: string; logo: string };
} = {
  '61': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '77': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '68': { id: 'somnet', name: 'Somnet', logo: somnetLogo },
  '62': { id: 'somtel', name: 'Somtel', logo: somtelLogo },
  '71': { id: 'amtel', name: 'Amtel', logo: amtelLogo },
  '64': { id: 'somlink', name: 'Somlink', logo: somlinkLogo }
};

// Sender phone only supports Hormuud (61, 77) and Somnet (68)
const senderProviderMap: {
  [key: string]: { id: string; name: string; logo: string };
} = {
  '61': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '77': { id: 'hormuud', name: 'Hormuud', logo: hormuudLogo },
  '68': { id: 'somnet', name: 'Somnet', logo: somnetLogo }
};
const supportedSenderPrefixes = ['61', '77', '68'];

const detectReceiverProvider = (phone: string) => {
  if (phone.length < 2) return null;
  return allProviderMap[phone.substring(0, 2)] || null;
};
const detectSenderProvider = (phone: string) => {
  if (phone.length < 2) return null;
  return senderProviderMap[phone.substring(0, 2)] || null;
};
const isUnsupportedSenderPrefix = (phone: string): boolean => {
  if (phone.length < 2) return false;
  return !supportedSenderPrefixes.includes(phone.substring(0, 2));
};

const OfflineMode = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isReallyOnline } = useConnectivity();
  const t = useTenant();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;
  const brandLogo = tenant?.logo_url || najaxLogo;
  const brandName = tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App';
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [senderError, setSenderError] = useState(false);
  const [receiverError, setReceiverError] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [detectedProvider, setDetectedProvider] = useState<{ id: string; name: string; logo: string } | null>(null);
  const [detectedSenderProvider, setDetectedSenderProvider] = useState<{ id: string; name: string; logo: string } | null>(null);
  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';

  useEffect(() => {
    primeAudioPrompts();
    void playAudioPrompt('offline');
  }, []);

  useEffect(() => {
    const currentSender = localStorage.getItem('offlineSenderPhone') || '';
    const currentReceiver = localStorage.getItem('offlineReceiverPhone') || '';
    if (currentSender && !senderPhone) setSenderPhone(currentSender);
    if (currentReceiver && !receiverPhone) setReceiverPhone(currentReceiver);
  }, []);

  useEffect(() => {
    setDetectedProvider(detectReceiverProvider(receiverPhone));
    if (receiverPhone.length > 0) setReceiverError(false);
  }, [receiverPhone]);

  useEffect(() => {
    setDetectedSenderProvider(detectSenderProvider(senderPhone));
    if (senderPhone.length > 0) setSenderError(false);
  }, [senderPhone]);

  const handleRegister = async () => {
    const isValidSender = senderPhone.length === 9 && /^\d+$/.test(senderPhone);
    const isValidReceiver = receiverPhone.length === 9 && /^\d+$/.test(receiverPhone);
    if (!isValidSender) setSenderError(true);
    if (!isValidReceiver) setReceiverError(true);
    if (!isValidSender || !isValidReceiver) return;
    if (!detectedProvider) {
      setReceiverError(true);
      return;
    }
    if (!detectedSenderProvider) {
      setSenderError(true);
      return;
    }
    setIsRegistering(true);
    
    if (!navigator.onLine) {
      toast({
        title: "Internet ma jiro",
        description: "Waxaad u baahan tahay internet si aad u diiwaan geliso lambarada",
        variant: "destructive",
        duration: 3000
      });
      setIsRegistering(false);
      return;
    }
    
    try {
      // Iftin Partner API is the ONLY store — nothing is saved locally.
      const apiRes = await saveOfflineRegistration({
        senderPhone,
        receiverPhone,
        providerName: detectedProvider.name,
      });

      if (!apiRes.ok) {
        toast({
          title: "Lama diiwaan gelin",
          description: `${apiRes.message ?? 'Khalad'}${apiRes.error ? ` (${apiRes.error})` : ''}`,
          variant: "destructive",
          duration: 4000
        });
        setIsRegistering(false);
        return;
      }

      // Session-only values used by the ordering flow (not a registration store).
      localStorage.setItem('offlineSenderPhone', senderPhone);
      localStorage.setItem('offlineReceiverPhone', receiverPhone);

      toast({
        title: "Lagu guuleystay",
        description: `Diiwaan gelin: ${senderPhone} → ${receiverPhone}`,
        duration: 2000
      });
      navigate('/providers');
    } catch (error) {
      console.error('Registration error:', error);
      toast({
        title: "Digniinta",
        description: "Registration ma keydsamo lakin wuu socon doonaa",
        variant: "default"
      });
      navigate('/providers');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-6 py-6">
      {/* Step Progress */}
      <div className="w-full max-w-sm mb-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-primary">Login</span>
          </div>
          <div className="w-12 h-0.5 bg-primary" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              2
            </div>
            <span className="text-sm font-medium text-primary">Lambarada</span>
          </div>
          <div className="w-12 h-0.5 bg-muted" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm">
              3
            </div>
            <span className="text-sm font-medium text-muted-foreground">Iibso</span>
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="mb-6 mt-2">
        <CachedImage alt={brandName} className="w-28 h-28 object-cover rounded-2xl" src={brandLogo} fallback={<img src={najaxLogo} alt={brandName} className="w-28 h-28 object-cover rounded-2xl" />} />
      </div>

      {/* Tagline */}
      <div className="text-center mb-8 max-w-sm">
        <h1 className="font-bold mb-4 text-3xl text-center">
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Iibso Internet adigoo Offline ah!
          </span>
        </h1>
        
        <div className="bg-primary/5 backdrop-blur-sm rounded-xl p-4 border border-primary/20">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Diiwaangeli lambarka aad <span className="text-primary font-semibold">lacagta ka direysid</span> iyo 
            lambarka aad <span className="text-primary font-semibold">internet-ka u rabtid</span>, si aad 
            ugu shubtid adigoo offline ah.
          </p>
          <p className="text-center mt-3 text-lg">🎉 Mahadsanid!</p>
        </div>
      </div>

      {/* Phone Inputs */}
      <div className="w-full max-w-sm space-y-4 mb-8">
        {/* Sender Phone Input */}
        <div className="space-y-2">
          <PhoneNumberInput
            id="sender-phone"
            label="📤 Lambarka lacagta laga dirayo"
            value={senderPhone}
            onChange={setSenderPhone}
            placeholder={savedSenderPhone || '61 xxx xxxx'}
            hasError={senderError}
            enterKeyHint="next"
            provider={detectedSenderProvider}
          />
          {senderError && <p className="text-sm text-destructive">Fadlan geli lambar saxan (9 tiro)</p>}
          {isUnsupportedSenderPrefix(senderPhone) && !senderError && (
            <p className="text-sm text-destructive">Hormuud (61, 77) iyo Somnet (68) kaliya ayaa la taageera</p>
          )}
        </div>

        {/* Receiver Phone Input */}
        <div className="space-y-2">
          <PhoneNumberInput
            id="receiver-phone"
            label="📥 Lambarka internet-ka loo rabo"
            value={receiverPhone}
            onChange={setReceiverPhone}
            placeholder={savedReceiverPhone || '61 xxx xxxx'}
            hasError={receiverError}
            enterKeyHint="done"
            provider={detectedProvider}
          />
          {receiverError && <p className="text-sm text-destructive">Fadlan geli lambar saxan (9 tiro)</p>}
          {detectedProvider && !receiverError && (
            <div className="flex items-center gap-2 text-sm text-primary">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span>Provider: {detectedProvider.name}</span>
            </div>
          )}
        </div>

      </div>

      {/* Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={handleRegister}
          disabled={isRegistering || !senderPhone || !receiverPhone}
          className="w-full rounded-xl bg-primary text-primary-foreground font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] py-3"
        >
          {isRegistering ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Sugayso...
            </span>
          ) : (
            'Sii wad →'
          )}
        </button>

        <button
          onClick={() => {
            localStorage.setItem('hasSkippedOfflineRegistration', 'true');
            navigate('/providers');
          }}
          className="w-full rounded-xl border border-border text-muted-foreground font-medium text-sm transition-all hover:bg-muted/50 active:scale-[0.98] py-2.5"
        >
          Skip →
        </button>
      </div>
    </div>
  );
};

export default OfflineMode;