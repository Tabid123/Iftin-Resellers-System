import React from 'react';
import CachedImage from '@/components/CachedImage';

interface ProviderCardProps {
  name: string;
  logo: string;
  onClick: () => void;
  disabled?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  hormuud: '142 72% 40%',
  somnet: '205 64% 53%',
  somtel: '47 95% 53%',
  amtel: '0 78% 55%',
  somlink: '276 55% 47%',
};

const getProviderColor = (name: string): string => {
  const key = name.toLowerCase().trim();

  for (const [provider, color] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(provider)) return color;
  }

  return '281 100% 20%';
};

const ProviderCard = ({ name, logo, onClick, disabled = false }: ProviderCardProps) => {
  const providerColor = getProviderColor(name);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={disabled ? undefined : {
        borderColor: `hsl(${providerColor})`,
      }}
      className={`group relative w-full rounded-2xl bg-card border-2 p-3 flex flex-col items-center justify-center gap-2 transition-all duration-300 ${
        !disabled
          ? 'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97]'
          : 'opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <CachedImage
          src={logo}
          alt={`${name} logo`}
          bundledName={name}
          className="h-full w-full object-contain"
          loading="eager"
          decoding="async"
        />
      </div>

      <span className="relative text-xs font-semibold text-foreground tracking-tight">{name}</span>
    </button>
  );
};

export default ProviderCard;