import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import somaliaFlag from '@/assets/somalia-flag-hq.png';
import { useNavigate } from "@/lib/router-compat";
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ShieldCheck } from 'lucide-react';

const PhoneInput = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPrefixError, setShowPrefixError] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const generateVerificationCode = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const handlePhoneNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 9) {
      setPhoneNumber(value);
      setShowPrefixError(false);
    }
  };

  const handleSendCode = async () => {
    if (!phoneNumber.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli lambarka telefoonkaaga",
        variant: "destructive",
      });
      return;
    }

    const allowedPrefixes = ['61', '77', '62', '68'];
    const hasAllowedPrefix = allowedPrefixes.some(prefix => phoneNumber.startsWith(prefix));
    
    if (!hasAllowedPrefix || phoneNumber.length !== 9) {
      setShowPrefixError(true);
      toast({
        title: "Error",
        description: "Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    const code = generateVerificationCode();
    const fullPhoneNumber = `+252${phoneNumber}`;
    
    try {
      // Check if phone is already verified (tenant-scoped, no direct table access)
      const { data: existingPhone } = await supabase
        .rpc('storefront_phone_is_verified', { p_phone: fullPhoneNumber });

      if (existingPhone) {
        setIsReturningUser(true);
      }

      // Show code on screen directly - no SMS needed
      setGeneratedCode(code);
      setIsCodeSent(true);
      localStorage.setItem('verificationCode', code);
      localStorage.setItem('codeTimestamp', Date.now().toString());
      localStorage.setItem('pendingPhone', phoneNumber);
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: 'Wax khalad ah ayaa dhacay',
        variant: 'destructive',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleResendCode = () => {
    const code = generateVerificationCode();
    setGeneratedCode(code);
    localStorage.setItem('verificationCode', code);
    localStorage.setItem('codeTimestamp', Date.now().toString());
    setVerificationCode('');
    toast({
      title: "Code cusub!",
      description: "Koodka cusub ayaa shaashada kugu soo muuqday",
    });
  };

  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      toast({
        title: "Error",
        description: "Fadlan geli koodka xaqiijinta",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    
    const storedCode = localStorage.getItem('verificationCode');
    const codeTimestamp = localStorage.getItem('codeTimestamp');
    
    if (codeTimestamp) {
      const timeElapsed = (Date.now() - parseInt(codeTimestamp)) / 1000;
      if (timeElapsed > 120) {
        toast({
          title: "Koodka wuu dhacay",
          description: "Fadlan code cusub soo codso",
          variant: "destructive",
        });
        setIsVerifying(false);
        return;
      }
    }
    
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
      localStorage.setItem('userPhone', phoneNumber);
      localStorage.removeItem('verificationCode');
      localStorage.removeItem('codeTimestamp');
      localStorage.removeItem('pendingPhone');
      
      toast({
        title: "Guul!",
        description: "Lambarka telefoonka waa la xaqiijiyay",
      });
      
      setIsVerifying(false);
      navigate('/offline-mode');
    } else {
      toast({
        title: "Kood khaldan",
        description: "Koodka aad gelisay waa khalad",
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {!isCodeSent ? (
        <>
          <div className="space-y-2">
            <label htmlFor="phone" className="text-base font-medium text-muted-foreground">
              Geli lambarka telefoonkaaga
            </label>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 bg-card border border-input rounded-xl px-3 py-2.5 text-base font-medium">
                <img src={somaliaFlag} alt="Calanka Somalia" className="w-7 h-5 object-cover rounded" />
                <span>+252</span>
              </div>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="tel-national"
                placeholder="61 xxx xxxx"
                value={phoneNumber}
                onChange={handlePhoneNumberChange}
                maxLength={9}
                className="flex-1 h-12 text-base rounded-xl focus:border-primary focus:ring-primary/30 focus:outline-none focus:ring-2"
              />
            </div>
            {showPrefixError && (
              <p className="text-xs text-destructive">
                Kaliya Hormuud (61, 77), Somtel (62) iyo Somnet (68) ayaa loo ogol yahay
              </p>
            )}
          </div>
          
          <Button 
            onClick={handleSendCode}
            disabled={isSending}
            className="w-full bg-primary text-primary-foreground font-semibold h-12 rounded-xl text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Login'
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="text-center space-y-1">
            {isReturningUser && (
              <p className="text-sm font-semibold text-primary">
                🎉 Soo dhawaaw mar kale!
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Xaqiijinta lambarka +252 {phoneNumber}
            </p>
          </div>

          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-primary">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-sm font-semibold">Koodkaagu waa</span>
            </div>
            <div className="flex justify-center gap-2">
              {generatedCode.split('').map((digit, i) => (
                <span key={i} className="text-3xl font-bold text-primary bg-primary/10 rounded-lg w-12 h-12 flex items-center justify-center">
                  {digit}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Geli koodkan hoosta</p>
          </div>
          
          <div className="space-y-1.5">
            <label htmlFor="code" className="text-sm font-medium text-muted-foreground">
              Koodka Xaqiijinta
            </label>
            <div className="flex gap-2 justify-center">
              {[0, 1, 2, 3].map((index) => (
                <Input
                  key={index}
                  ref={(element) => {
                    codeInputRefs.current[index] = element;
                  }}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  value={verificationCode[index] || ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length > 1) {
                      const digits = value.slice(0, 4).split('');
                      setVerificationCode(digits.join(''));
                      const lastIndex = Math.min(digits.length - 1, 3);
                      codeInputRefs.current[lastIndex]?.focus();
                    } else if (value) {
                      const newCode = verificationCode.padEnd(4, ' ').split('');
                      newCode[index] = value;
                      setVerificationCode(newCode.join('').trimEnd());
                      if (index < 3) {
                        codeInputRefs.current[index + 1]?.focus();
                      }
                    } else {
                      const newCode = verificationCode.padEnd(4, ' ').split('');
                      newCode[index] = ' ';
                      setVerificationCode(newCode.join('').trimEnd());
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      if (verificationCode[index]) {
                        const newCode = verificationCode.padEnd(4, ' ').split('');
                        newCode[index] = ' ';
                        setVerificationCode(newCode.join('').trimEnd());
                        e.preventDefault();
                      } else if (index > 0) {
                        const newCode = verificationCode.padEnd(4, ' ').split('');
                        newCode[index - 1] = ' ';
                        setVerificationCode(newCode.join('').trimEnd());
                        codeInputRefs.current[index - 1]?.focus();
                        e.preventDefault();
                      }
                    } else if (e.key === 'Delete') {
                      const newCode = verificationCode.padEnd(4, ' ').split('');
                      newCode[index] = ' ';
                      setVerificationCode(newCode.join('').trimEnd());
                      e.preventDefault();
                    }
                  }}
                  className="w-12 h-12 text-center text-xl font-semibold rounded-xl focus:border-primary focus:ring-primary/30 focus:outline-none focus:ring-2"
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-end">
            <button 
              className="text-primary hover:underline text-sm"
              onClick={handleResendCode}
            >
              Code cusub
            </button>
          </div>
          
          <Button 
            onClick={handleVerifyCode}
            disabled={isVerifying}
            className="w-full bg-primary text-primary-foreground font-semibold h-11 rounded-xl text-base hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isVerifying ? 'Waa la xaqiijinayaa...' : 'Verify'}
          </Button>
          
          <button 
            onClick={() => setIsCodeSent(false)}
            className="w-full text-sm font-medium text-foreground/90 hover:text-primary transition-colors pt-0.5"
          >
            Bedel Lambarka Telefoonka
          </button>
        </>
      )}
    </div>
  );
};

export default PhoneInput;