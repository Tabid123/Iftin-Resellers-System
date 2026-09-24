import React from 'react';
import { useNavigate } from "@/lib/router-compat";
import { ArrowLeft, MessageCircle, Phone, ChevronRight, LogOut, Star, Share2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { showBannerAd, hideBannerAd } from '@/services/admob';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useEffect } from 'react';
import { useSupportPhone } from '@/hooks/useSupportPhone';
import { useTenant } from '@/contexts/TenantContext';

const Profile = () => {
  const navigate = useNavigate();
  const support = useSupportPhone();
  const tenantState = useTenant();
  const tenant = tenantState.status === 'ready' || tenantState.status === 'suspended' ? tenantState.tenant : null;
  const brandName = tenant?.name || (import.meta.env.VITE_TENANT_NAME as string) || 'App';
  const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    showBannerAd();
    return () => { hideBannerAd(); };
  }, []);

  const verifiedPhone = localStorage.getItem('verifiedPhone');
  const phoneNumber =
    localStorage.getItem('userPhone') ||
    localStorage.getItem('verifiedPhoneNumber') ||
    localStorage.getItem('userPhoneNumber') ||
    localStorage.getItem('verificationPhone') ||
    localStorage.getItem('phoneNumber') ||
    '';

  const handleLogout = () => {
    localStorage.removeItem('verifiedPhone');
    localStorage.removeItem('userPhone');
    localStorage.removeItem('verifiedPhoneNumber');
    localStorage.removeItem('userPhoneNumber');
    localStorage.removeItem('verificationPhone');
    localStorage.removeItem('phoneNumber');
    localStorage.removeItem('profileImage');
    localStorage.removeItem('hasSkippedOfflineRegistration');
    localStorage.removeItem('offlineSenderPhone');
    localStorage.removeItem('offlineReceiverPhone');
    toast.success('Waa laga baxay guul ahaan');
    navigate('/', { replace: true });
  };

  const handleDeleteAccount = () => {
    // Wipe user-specific data only. The tenant identity/branding of this build
    // must survive, otherwise the app would forget which reseller it belongs to
    // and could show the "workspace not found" page while offline.
    const keepExact = new Set(['najax.tenant_slug', 'app_cache_version', 'theme', 'language']);
    const keepPrefixes = ['najax.tenant_cache.', 'offline_', 'iftin_catalog_v', 'img_cache'];
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (keepExact.has(key)) continue;
        if (keepPrefixes.some((p) => key.startsWith(p))) continue;
        doomed.push(key);
      }
      doomed.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* storage unavailable */
    }
    toast.success('Account-ka waa la tirtiray');
    navigate('/', { replace: true });
  };

  const handleShare = async () => {
    const shareData = {
      title: brandName,
      text: `Soo degso ${brandName} App - Internet bundles iibso si fudud!`,
      url: shareUrl
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Link waa la copy-gareeye!');
      }
    } catch (err) {}
  };

  const profileOptions = [
    {
      icon: MessageCircle,
      title: 'Chat on Whatsapp',
      action: () => window.open(support.whatsappHref, '_blank')
    },
    {
      icon: Phone,
      title: 'Customer support call',
      action: () => window.open(support.telHref, '_self')
    },
    {
      icon: Star,
      title: `Qiimey ${brandName} App`,
      action: () => window.open('https://play.google.com/store/apps/details?id=app.lovable.5178b6a28d534275a37667022407be64', '_blank')
    },
    {
      icon: Share2,
      title: 'Lawadaag Asxaabtaada',
      action: handleShare
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div 
        style={{ 
          backgroundColor: 'hsl(var(--primary))',
          paddingTop: 'calc(1rem + var(--effective-safe-area-top, 0px))',
          boxSizing: 'border-box' as const
        }} 
        className="text-white py-4 px-4"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            {phoneNumber ? (
              <p className="text-white text-lg font-medium">+252{phoneNumber}</p>
            ) : (
              <p className="text-white text-lg font-medium">Ma gelin</p>
            )}
            <p className="text-white/70 text-sm">
              {verifiedPhone ? 'Verified Account' : 'Not Verified'}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 mt-4">
        {profileOptions.map((option, index) => (
          <div
            key={index}
            onClick={option.action}
            className="bg-card rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors border"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <option.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="font-medium text-foreground">{option.title}</span>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </div>
        ))}
        
        {/* Logout */}
        <div
          onClick={handleLogout}
          className="bg-destructive/10 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-destructive/20 transition-colors border border-destructive/20"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-destructive/20 rounded-lg flex items-center justify-center">
              <LogOut className="w-5 h-5 text-destructive" />
            </div>
            <span className="font-medium text-destructive">Log Out</span>
          </div>
          <ChevronRight className="w-5 h-5 text-destructive/70" />
        </div>

        {/* Delete Account */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <div className="bg-destructive/10 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-destructive/20 transition-colors border border-destructive/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-destructive/20 rounded-lg flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-destructive" />
                </div>
                <span className="font-medium text-destructive">Delete Account</span>
              </div>
              <ChevronRight className="w-5 h-5 text-destructive/70" />
            </div>
          </AlertDialogTrigger>
          <AlertDialogContent className="left-4 right-4 top-1/2 w-auto max-w-none translate-x-0 -translate-y-1/2 gap-3 rounded-3xl border-border bg-background p-5 shadow-2xl sm:left-1/2 sm:right-auto sm:w-full sm:max-w-sm sm:-translate-x-1/2">
            <AlertDialogHeader className="space-y-3 text-center">
              <AlertDialogTitle className="text-xl font-semibold leading-snug text-foreground">
                Ma hubtaa in aad tirtirayso account-ka?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-6 text-muted-foreground">
                Tani waxay si joogto ah u tirtiri doontaa xogtaada oo dhan. Tallaabadan dib looma celin karo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-col sm:justify-start sm:space-x-0">
              <AlertDialogAction
                onClick={handleDeleteAccount}
                className="w-full rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Account
              </AlertDialogAction>
              <AlertDialogCancel className="mt-0 w-full rounded-xl border-border bg-background text-foreground hover:bg-accent">
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

    </div>
  );
};

export default Profile;
