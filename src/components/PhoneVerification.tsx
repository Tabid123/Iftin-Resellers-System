import React, { useState, useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { setUserPhone } from '@/services/onesignal';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { ShieldCheck, Phone, ArrowLeft } from 'lucide-react';
import najaxLogo from '@/assets/najax-logo.jpeg';
import somaliaFlag from '@/assets/somalia-flag.png';
import hormuudLogo from '@/assets/providers/hormuud-logo.jpeg';
import somtelLogo from '@/assets/providers/somtel-logo.jpg';
import somnetLogo from '@/assets/providers/somnet-logo.png';
import amtelLogo from '@/assets/providers/amtel-logo.png';
import somlinkLogo from '@/assets/providers/somlink-logo.png';

interface PhoneVerificationProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  paymentProvider: string;
  packageData: any;
}

const getProviderFromPhone = (phone: string): { name: string; logo: string } => {
  if (phone.startsWith('61') || phone.startsWith('77')) return { name: 'Hormuud', logo: hormuudLogo };
  if (phone.startsWith('62')) return { name: 'Somtel', logo: somtelLogo };
  if (phone.startsWith('68')) return { name: 'Somnet', logo: somnetLogo };
  if (phone.startsWith('71')) return { name: 'Amtel', logo: amtelLogo };
  if (phone.startsWith('64')) return { name: 'Somlink', logo: somlinkLogo };
  return { name: '', logo: '' };
};

const PhoneVerification = ({ isOpen, onClose, onSuccess, paymentProvider, packageData }: PhoneVerificationProps) => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [canResend, setCanResend] = useState(true);
  const [generatedCode, setGeneratedCode] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) { setCanResend(true); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  const generateVerificationCode = () => Math.floor(1000 + Math.random() * 9000).toString();

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 9) setPhoneNumber(value);
  };

  const provider = getProviderFromPhone(phoneNumber);
  const validPrefixes = ['61', '77', '62', '68', '71', '64'];
  const hasValidPrefix = validPrefixes.some(p => phoneNumber.startsWith(p));
  const isPhoneValid = hasValidPrefix && phoneNumber.length === 9;

  const handleSendCode = async () => {
    if (!isPhoneValid) {
      toast({ title: "Khalad", description: "Fadlan geli lambarka sax ah", variant: "destructive" });
      return;
    }

    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;

    try {
      const { error } = await supabase.functions.invoke('queue-otp', {
        body: { phoneNumber: fullPhoneNumber, code }
      });
      if (error) throw error;

      setGeneratedCode(code);
      setIsCodeSent(true);
      setCanResend(false);
      setResendTimer(60);
      localStorage.setItem('verificationCode', code);
      toast({ title: "✅ Code la diray!", description: `Koodka waxaa loo diray +252 ${phoneNumber}` });
    } catch (error: any) {
      console.error('Error queueing OTP:', error);
      const msg = error?.message || 'Koodka lama diri karin.';
      toast({ title: 'Khalad', description: msg, variant: 'destructive' });
    }
  };

  const handleResendCode = async () => {
    if (!canResend) return;
    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;

    try {
      const { error } = await supabase.functions.invoke('queue-otp', {
        body: { phoneNumber: fullPhoneNumber, code }
      });
      if (error) throw error;

      setGeneratedCode(code);
      localStorage.setItem('verificationCode', code);
      setCanResend(false);
      setResendTimer(60);
      toast({ title: "✅ Code la diray!", description: `Koodka cusub waxaa loo diray +252 ${phoneNumber}` });
    } catch (error: any) {
      console.error('Error resending OTP:', error);
      toast({ title: 'Khalad', description: error?.message || 'Koodka lama diri karin.', variant: 'destructive' });
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim() || verificationCode.length < 4) {
      toast({ title: "Khalad", description: "Fadlan geli koodka 4-ka lambar ah", variant: "destructive" });
      return;
    }

    setIsVerifying(true);
    const storedCode = localStorage.getItem('verificationCode');

    if (verificationCode === storedCode) {
      try {
        const fullPhoneNumber = `+252${phoneNumber}`;
        await supabase.rpc('storefront_register_verified_phone', {
          p_phone: fullPhoneNumber,
          p_code: storedCode,
        });
      } catch (error) {
        console.error('Error saving verified phone:', error);
      }

      localStorage.setItem('verifiedPhone', phoneNumber);
      localStorage.setItem('userPhoneNumber', phoneNumber);
      setUserPhone(phoneNumber);

      toast({ title: "✅ Xaqiijin guul!", description: "Fadlan diiwaangeli lambaradaada." });
      localStorage.removeItem('verificationCode');
      setIsVerifying(false);
      onClose();
      navigate('/offline-mode');
    } else {
      toast({ title: "Khalad", description: "Koodka aad gelisay waa mid khaldan.", variant: "destructive" });
      setIsVerifying(false);
    }
  };

  const codeDigits = generatedCode.split('');

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-y-auto border-0 rounded-3xl bg-background max-h-[calc(100dvh-1rem)] overscroll-contain">
        {!isCodeSent ? (
          /* ───────── PHONE INPUT STEP ───────── */
          <div className="flex flex-col items-center px-5 py-5">
            <div className="w-16 h-16 rounded-xl overflow-hidden shadow-md mb-1.5 border border-primary/20">
              <img src={najaxLogo} alt="Najax Data" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-base font-black text-foreground leading-tight">NAJAX</h1>
            <p className="text-[10px] font-bold tracking-[0.2em] text-accent mb-1">D A T A</p>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground">Internet aad ku kalsoon tahay</span>
              <div className="w-6 h-px bg-border" />
            </div>

            <div className="w-full rounded-xl border border-border bg-card p-3.5 space-y-3">
              <div className="flex items-center gap-1.5 justify-center">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">Geli lambarkaaga</span>
              </div>

              <div className="flex items-center gap-2" data-keyboard-anchor>
                <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-muted/50 border border-border">
                  <img src={somaliaFlag} alt="🇸🇴" className="w-6 h-4 object-cover rounded" width={24} height={16} />
                  <span className="text-xs font-bold text-foreground">+252</span>
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  placeholder="61 xxx xxxx"
                  value={phoneNumber}
                  onChange={handlePhoneNumberChange}
                  maxLength={9}
                  className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                />
              </div>

              {provider.logo && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                  <img src={provider.logo} alt={provider.name} className="w-8 h-6 object-contain rounded" />
                  <span className="text-xs font-medium text-foreground">{provider.name}</span>
                </div>
              )}

              {!hasValidPrefix && phoneNumber.length >= 2 && (
                <p className="text-[10px] text-destructive text-center">
                  Isticmaal: 61/77, 62, 68, 71, 64
                </p>
              )}
            </div>

            <Button
              onClick={handleSendCode}
              disabled={!isPhoneValid}
              className="w-full mt-3 h-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-lg shadow-primary/25 disabled:opacity-40 disabled:shadow-none transition-all"
            >
              Dir Koodka
            </Button>

            <p className="text-[9px] text-muted-foreground mt-2">Developed by Saabir</p>
          </div>
        ) : (
          /* ───────── VERIFICATION STEP ───────── */
          <div className="flex flex-col items-center px-5 py-4">
            <div className="w-12 h-12 rounded-lg overflow-hidden shadow-md mb-1 border border-primary/20">
              <img src={najaxLogo} alt="Najax Data" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-sm font-black text-foreground leading-tight">NAJAX</h1>
            <p className="text-[8px] font-bold tracking-[0.2em] text-accent mb-2">D A T A</p>

            <div className="w-full rounded-xl border border-border bg-card p-3 mb-2.5">
              <p className="text-xs font-semibold text-foreground text-center">🎉 Soo dhawaaw!</p>
              <p className="text-[11px] text-muted-foreground text-center mb-2">
                Xaqiijinta +252 {phoneNumber}
              </p>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-2">
                <div className="flex items-center gap-1 justify-center mb-1">
                  <ShieldCheck className="w-3 h-3 text-primary" />
                  <span className="text-[11px] font-semibold text-foreground">Koodkaagu waa</span>
                </div>
                <div className="flex items-center justify-center gap-1.5 mb-0.5">
                  {codeDigits.map((digit, i) => (
                    <div
                      key={i}
                      className="w-9 h-9 rounded-md bg-primary/10 border-2 border-primary/30 flex items-center justify-center"
                    >
                      <span className="text-base font-black text-primary">{digit}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground text-center">Geli koodkan hoosta</p>
              </div>
            </div>

            <div className="w-full space-y-1 mb-1.5" data-keyboard-anchor>
              <p className="text-[11px] font-semibold text-foreground">Koodka Xaqiijinta</p>
              <InputOTP
                maxLength={4}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 4))}
              >
                <InputOTPGroup className="gap-1.5 w-full justify-center">
                  {[0, 1, 2, 3].map((index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="w-11 h-11 rounded-lg border-2 border-border text-base font-bold bg-card first:rounded-lg last:rounded-lg data-[active=true]:border-primary data-[active=true]:ring-2 data-[active=true]:ring-primary/20"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="w-full flex justify-end mb-1.5">
              <button
                onClick={handleResendCode}
                disabled={!canResend}
                className={`text-[11px] font-semibold text-primary ${!canResend ? 'opacity-40 cursor-not-allowed' : 'hover:underline'}`}
              >
                {canResend ? 'Code cusub' : `Code cusub (${resendTimer}s)`}
              </button>
            </div>

            <Button
              onClick={handleVerifyCode}
              disabled={isVerifying || verificationCode.length < 4}
              className="w-full h-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm shadow-lg shadow-primary/25 disabled:opacity-40 disabled:shadow-none transition-all"
            >
              {isVerifying ? 'Sugaya...' : 'Xaqiiji'}
            </Button>

            <button
              onClick={() => { setIsCodeSent(false); setVerificationCode(''); setGeneratedCode(''); }}
              className="flex items-center gap-1 mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Badal Lambarka
            </button>

            <p className="text-[8px] text-muted-foreground mt-1.5">Developed by Saabir</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PhoneVerification;
