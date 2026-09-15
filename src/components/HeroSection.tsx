import React from 'react';
import najaxLogo from '@/assets/najax-logo.jpeg';
import { useTenant } from '@/contexts/TenantContext';
import CachedImage from '@/components/CachedImage';

const HeroSection = () => {
  const t = useTenant();
  const tenant = t.status === 'ready' || t.status === 'suspended' ? t.tenant : null;
  const logo = tenant?.logo_url || najaxLogo;
  const name = tenant?.name || 'NAJAX DATA';

  return (
    <div className="text-center space-y-5 pt-4">
      <div className="w-36 h-36 mx-auto rounded-[2rem] overflow-hidden shadow-xl shadow-primary/20 bg-card">
        <CachedImage src={logo} alt={name} kind="provider" className="w-full h-full object-cover" fallback={<img src={najaxLogo} alt={name} className="w-full h-full object-cover" />} />
      </div>

      <div className="space-y-1">
        <h1 className="text-4xl font-black tracking-tight text-primary leading-none uppercase">
          {name}
        </h1>
      </div>


      <div className="flex items-center gap-3 justify-center">
        <span className="h-px w-10 bg-border" />
        <p className="text-base text-muted-foreground font-medium">
          Internet aad ku kalsoon tahay
        </p>
        <span className="h-px w-10 bg-border" />
      </div>
    </div>
  );
};

export default HeroSection;
