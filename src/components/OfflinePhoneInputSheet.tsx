import { useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useConnectivity } from '@/contexts/ConnectivityContext';
import { saveOfflineRegistration } from '@/lib/offlineRegistration';

interface OfflinePhoneInputSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const digitsOnly = (value: string, max: number) => value.replace(/\D/g, '').slice(0, max);

const OfflinePhoneInputSheet = ({ open, onOpenChange }: OfflinePhoneInputSheetProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isReallyOnline } = useConnectivity();
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  const savedSenderPhone = localStorage.getItem('offlineSenderPhone') || '';
  const savedReceiverPhone = localStorage.getItem('offlineReceiverPhone') || '';

  const detectProvider = (phone: string): { id: string; name: string } | null => {
    const prefix = phone.substring(0, 2);
    const providerMap: { [key: string]: { id: string; name: string } } = {
      '61': { id: 'hormuud', name: 'Hormuud' },
      '68': { id: 'somnet', name: 'Somnet' },
      '62': { id: 'somtel', name: 'Somtel' },
      '71': { id: 'amtel', name: 'Amtel' },
      '64': { id: 'somlink', name: 'Somlink' },
    };

    return providerMap[prefix] || null;
  };

  const handleContinue = async () => {
    const isOnline = isReallyOnline === true;

    if (!isOnline) {
      toast({
        variant: "destructive",
        title: "Internet la'aan",
        description: "Waxaad u baahan tahay internet si aad u baddasho lambarada",
        duration: 3000,
      });
      return;
    }

    const isADSL = receiverPhone.startsWith('1');

    if (isADSL) {
      if (!/^1\d{6}$/.test(receiverPhone)) {
        toast({
          variant: "destructive",
          title: "Khalad",
          description: "ADSL-ka wuxuu u baahan yahay 7 lambar bilaabanaya 1",
          duration: 3000,
        });
        return;
      }
    } else if (!/^\d{9}$/.test(senderPhone) || !/^\d{9}$/.test(receiverPhone)) {
      toast({
        variant: "destructive",
        title: "Khalad",
        description: "Fadlan geli lambar saxan (9 tiro)",
        duration: 3000,
      });
      return;
    }

    if (!/^\d{9}$/.test(senderPhone)) {
      toast({
        variant: "destructive",
        title: "Khalad",
        description: "Lambarka laga dirayo waa inuu ahaadaa 9 lambar",
        duration: 3000,
      });
      return;
    }

    const provider = isADSL ? { id: 'adsl', name: 'ADSL' } : detectProvider(receiverPhone);

    if (provider) {
      if (!isADSL) {
        const apiRes = await saveOfflineRegistration({
          senderPhone,
          receiverPhone,
          providerName: provider.name,
        });
        if (!apiRes.ok) {
          toast({
            variant: "destructive",
            title: "Lama diiwaan gelin",
            description: `${apiRes.message ?? 'Khalad'}${apiRes.error ? ` (${apiRes.error})` : ''}`,
            duration: 4000,
          });
          return;
        }
        toast({
          title: "Lagu guuleystay",
          description: `${senderPhone} → ${receiverPhone}`,
          duration: 2000,
        });
      }

      localStorage.setItem('offlineSenderPhone', senderPhone);
      localStorage.setItem('offlineReceiverPhone', receiverPhone);

      navigate(`/categories/${provider.id}`, {
        state: {
          providerName: provider.name,
          senderPhone,
          receiverPhone,
          isOffline: true
        }
      });
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto">
        <SheetHeader>
          <SheetTitle>Macluumaadka Offline</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sender-phone">Lambarka laga dirayo</Label>
            <Input
              id="sender-phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel-national"
              enterKeyHint="next"
              placeholder={savedSenderPhone || "tusaale 61xxxxxxx"}
              value={senderPhone}
              maxLength={9}
              onChange={(e) => setSenderPhone(digitsOnly(e.target.value, 9))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receiver-phone">Lambarka loo dirayo ama xirmada loo rabo</Label>
            <Input
              id="receiver-phone"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel-national"
              enterKeyHint="done"
              placeholder={savedReceiverPhone || "Mobile: 61xxxxxxx | ADSL: 1xxxxxx"}
              value={receiverPhone}
              maxLength={9}
              onChange={(e) => setReceiverPhone(digitsOnly(e.target.value, 9))}
            />
            <p className="text-xs text-muted-foreground">
              Mobile: 9 lambar (61xxxxxxx) | ADSL: 7 lambar (1xxxxxx)
            </p>
          </div>

          <Button
            onClick={handleContinue}
            className="w-full"
            disabled={!senderPhone || !receiverPhone}
          >
            Bedel Lambarka
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default OfflinePhoneInputSheet;
